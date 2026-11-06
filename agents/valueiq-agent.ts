import {
  Agent,
  callable,
  getCurrentAgent,
  type Connection,
  type ConnectionContext,
} from "agents";
import type { PreflightReport } from "../assistant/run/orchestrator";
import { CHECKLIST_LABELS } from "../assistant/run/types";
import type { RunRecord } from "../assistant/run/types";
import {
  asFormFile,
  makeOrchestrator,
  runStoreFor,
  startRunRecord,
} from "../app/server/run-wiring.server";
import { getProjectForm } from "../app/server/projects.server";
import { USER_ID_HEADER } from "../app/server/agent-gate.server";
import { RunAccessError } from "../app/server/run-store.server";
import type { RunView } from "../shared/types";
import type { RunError } from "../shared/types";
import type { RunProgress } from "./calculation-run";
import { errorFromWorkflowText } from "../assistant/run/error-text";

type ConnState = { userId: string };
export type CallResult<T> =
  { ok: true; value: T } | { ok: false; error: RunError };

const fail = (
  code: RunError["code"],
  message: string,
  retryable = false,
): { ok: false; error: RunError } => ({
  ok: false,
  error: { code, message, retryable },
});

export const IDLE_VIEW: RunView = {
  run_id: null,
  status: "idle",
  step: null,
  progress_pct: 0,
  checklist: CHECKLIST_LABELS.map((label) => ({ label, state: "todo" })),
  pending_question: null,
  mode: "real",
};

const ACTIVE = new Set(["preflight", "running", "blocked_on_question"]);

/** The view a stored run implies (used when the agent wakes or a run is reused). */
function viewOf(r: RunRecord): RunView {
  const done = r.status === "released" || r.status === "gap_list";
  return {
    ...IDLE_VIEW,
    run_id: r.id,
    status: r.status,
    step: done ? (r.status === "released" ? "Released" : "Gap list") : null,
    progress_pct: done ? 100 : 0,
    checklist: CHECKLIST_LABELS.map((label) => ({
      label,
      state: done ? ("done" as const) : ("todo" as const),
    })),
    mode: r.mode,
    ...(r.error ? { error: r.error } : {}),
  };
}

/**
 * One agent per project (the instance name is the project id). Its state is
 * the small `RunView`; the form, files, runs and results stay in D1 and R2.
 *
 * Trust model: `routeAgentRequest` runs the access gate before this object
 * wakes and sets `x-valueiq-user-id`; `onConnect` keeps it in connection state.
 * Callable arguments are untrusted and never carry a user or project id.
 * `startRun` and `cancelRun` re-check team membership in D1 for that user id.
 */
export class ValueIQAgent extends Agent<Env, RunView> {
  initialState: RunView = IDLE_VIEW;

  onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    const userId = ctx.request.headers.get(USER_ID_HEADER);
    if (!userId) {
      // Reached without the gate (it always sets the header): refuse.
      connection.close(4401, "Unauthorized");
      return;
    }
    connection.setState({ userId });
  }

  private callerId(): string | null {
    const { connection } = getCurrentAgent();
    const state = connection?.state as ConnState | null | undefined;
    return state?.userId ?? null;
  }

  private async memberOrError(): Promise<
    { ok: true; userId: string } | { ok: false; error: RunError }
  > {
    const userId = this.callerId();
    if (!userId) return fail("ACCESS_DENIED", "Access denied");
    try {
      await runStoreFor({ userId, projectId: this.name }).assertAccess();
    } catch (e) {
      if (e instanceof RunAccessError)
        return fail("ACCESS_DENIED", "Access denied");
      throw e;
    }
    return { ok: true, userId };
  }

  /** Runs the assistant pre-flight (cheap model). Not allowed while a run is active. */
  @callable()
  async preflight(): Promise<CallResult<PreflightReport>> {
    const who = await this.memberOrError();
    if (!who.ok) return who;
    if (ACTIVE.has(this.state.status))
      return fail("BAD_INPUT", "A run is already in progress");
    const store = runStoreFor({ userId: who.userId, projectId: this.name });
    const orch = makeOrchestrator({
      projectId: this.name,
      userId: who.userId,
      store,
      onView: (v) => this.setState(v),
    });
    try {
      return { ok: true, value: await orch.preflight() };
    } catch (e) {
      return fail(
        "MODEL_ERROR",
        e instanceof Error ? e.message : "Pre-flight failed",
      );
    }
  }

  /**
   * Validates the saved form, creates the run row (idempotent for the same
   * project, form and versions) and starts the `CalculationRun` workflow with
   * the run id as the workflow instance id.
   */
  @callable()
  async startRun(): Promise<CallResult<RunView>> {
    const who = await this.memberOrError();
    if (!who.ok) return who;
    const caller = { userId: who.userId, projectId: this.name };

    const saved = await getProjectForm(this.name);
    if (!saved) return fail("BAD_INPUT", "No form has been saved yet");
    let form;
    try {
      form = asFormFile(saved.formJson);
    } catch (e) {
      return fail("BAD_INPUT", e instanceof Error ? e.message : "Bad form");
    }

    const { run, created } = await startRunRecord(caller, form);
    if (!created) {
      // Same project, form and versions: the existing run is the answer.
      const view = viewOf(run);
      this.setState(view);
      return { ok: true, value: view };
    }

    const view: RunView = {
      ...IDLE_VIEW,
      run_id: run.id,
      status: "running",
      step: "Queued",
      mode: run.mode,
    };
    this.setState(view);
    try {
      await this.runWorkflow(
        "RUN_WORKFLOW",
        { runId: run.id, projectId: this.name },
        { id: run.id },
      );
    } catch {
      const error: RunError = {
        code: "MODEL_ERROR",
        message: "The run could not be started",
        retryable: true,
      };
      const sys = runStoreFor({ userId: null, projectId: this.name });
      await sys.updateRun(run.id, {
        status: "failed",
        finished_at: new Date().toISOString(),
      });
      await this.eventFor(run.id, "error", error);
      const failed: RunView = { ...view, status: "failed", error };
      this.setState(failed);
      return { ok: true, value: failed };
    }
    return { ok: true, value: view };
  }

  /** Terminates the workflow and ends the run as cancelled. */
  @callable()
  async cancelRun(): Promise<CallResult<RunView>> {
    const who = await this.memberOrError();
    if (!who.ok) return who;
    const runId = this.state.run_id;
    if (runId && ACTIVE.has(this.state.status)) {
      try {
        await this.terminateWorkflow(runId);
      } catch {
        // already finished or unknown to the workflow: the row update below decides
      }
      const store = runStoreFor({ userId: who.userId, projectId: this.name });
      await store.cancel(runId, new Date().toISOString());
      await this.eventFor(runId, "status", { status: "cancelled" });
      this.setState({
        ...this.state,
        status: "cancelled",
        step: "Cancelled",
      });
    } else if (this.state.status === "preflight") {
      this.setState({ ...IDLE_VIEW, status: "cancelled", step: "Cancelled" });
    }
    return { ok: true, value: this.state };
  }

  /** ask_user is tabled: there is never a pending question to answer. */
  @callable()
  answerQuestion(
    _questionId: string,
    _answer: unknown,
  ): Promise<CallResult<never>> {
    return Promise.resolve(
      fail("NOT_SUPPORTED", "Mid-run questions are not supported yet"),
    );
  }

  // ---- workflow callbacks (called by CalculationRun over RPC, no browser caller) ----

  /** Appends an audit event after the workflow stopped writing (seq = next free). */
  private async eventFor(
    runId: string,
    type: string,
    payload: object,
  ): Promise<void> {
    try {
      const sys = runStoreFor({ userId: null, projectId: this.name });
      const last = (await sys.listRunEvents(runId)).reduce(
        (m, e) => Math.max(m, e.seq),
        0,
      );
      await sys.appendRunEvent({
        run_id: runId,
        seq: last + 1,
        step: this.state.step,
        type,
        payload_json: JSON.stringify(payload),
        created_at: new Date().toISOString(),
      });
    } catch {
      // the audit log must never break the run; a seq clash is the only expected cause
    }
  }

  override onWorkflowProgress(
    _workflowName: string,
    workflowId: string,
    progress: unknown,
  ): Promise<void> {
    const view = (progress as Partial<RunProgress> | null)?.view;
    // The orchestrator in the workflow already wrote the run_events for this step.
    if (view && view.run_id === workflowId) this.setState(view);
    return Promise.resolve();
  }

  override async onWorkflowComplete(
    _workflowName: string,
    workflowId: string,
  ): Promise<void> {
    const sys = runStoreFor({ userId: null, projectId: this.name });
    const rec = await sys.getRun(workflowId);
    if (rec) this.setState(viewOf(rec));
    await this.eventFor(workflowId, "workflow_complete", {
      status: rec?.status ?? null,
    });
  }

  override async onWorkflowError(
    _workflowName: string,
    workflowId: string,
    error: string,
  ): Promise<void> {
    const sys = runStoreFor({ userId: null, projectId: this.name });
    let rec = await sys.getRun(workflowId);
    if (rec && ACTIVE.has(rec.status)) {
      // The workflow died without the orchestrator ending the run.
      rec = await sys.updateRun(workflowId, {
        status: "failed",
        finished_at: new Date().toISOString(),
      });
    }
    if (rec?.status === "cancelled") return;
    const failedView = rec ? viewOf(rec) : this.state;
    const err: RunError = failedView.error ?? errorFromWorkflowText(error);
    this.setState({ ...failedView, status: "failed", error: err });
    // Only the code is stored below; the runtime's text is never logged as is.
    await this.eventFor(workflowId, "workflow_error", {
      code: err.code,
      retryable: err.retryable,
    });
  }
}
