// Run orchestrator: the contract's run states (idle, preflight, running, released, gap_list, failed,
// cancelled) over a RunStore. blocked_on_question is NOT implemented (ask_user is tabled); the pause
// would be a plain return so a Cloudflare Workflow can later map it to step.waitForEvent.
// All model calls go through assistant/gemini.ts (via runGuarded). Events hold ids and hashes only.
import {
  DEFAULT_CONFIG,
  EngineIntegrityError,
  EngineValidationError,
  type FormFile,
  type RunOutput,
} from "../../engine";
import {
  GeminiHttpError,
  MaxStepsError,
  ModelMismatchError,
  RunCancelledError,
  hashOf,
  type FetchLike,
  type GeminiEvent,
} from "../gemini";
import { runGuarded } from "../guarded-loop";
import type { ModelIds, ThinkingSetting } from "../models";
import {
  ASSISTANT_SYSTEM,
  ASSISTANT_TOOLS,
  CALC_SYSTEM,
  CALC_TOOLS,
  intro,
} from "../prompts";
import { TOOLS, callTool, createContext, type ToolContext } from "../tools";
import {
  CHECKLIST_LABELS,
  type RunError,
  type RunErrorCode,
  type RunRecord,
  type RunStatus,
  type RunStore,
  type RunView,
} from "./types";

export class OrchestratorError extends Error {
  constructor(
    public readonly code: RunErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export interface OrchestratorDeps {
  store: RunStore;
  project_id: string;
  user_id: string;
  getForm: () => Promise<FormFile>;
  apiKey: string;
  models: ModelIds;
  thinking?: ThinkingSetting;
  fetch?: FetchLike;
  now: () => string;
  newRunId: () => string;
  mode?: "real" | "stub";
  /** Re-check team membership (contract section 6); false means ACCESS_DENIED. */
  checkAccess?: (user_id: string) => Promise<boolean>;
  onView?: (v: RunView) => void;
  maxSteps?: number;
}

export interface PreflightReport {
  passed: boolean;
  cancelled: boolean;
  message: string;
  details: unknown;
}
export interface RunOutcome {
  view: RunView;
  run_id: string | null;
  output: RunOutput | null;
  narrative: { source: "model" | "engine"; text: string } | null;
  /** true when an earlier run for the same project, form hash and versions was returned. */
  reused: boolean;
}

const TOOL_LABEL: Record<string, (typeof CHECKLIST_LABELS)[number]> = {
  compute_haircut: "Haircuts",
  compute_driver: "Drivers",
  compute_project: "Project",
  sensitivity: "Scenarios",
  get_confidence: "Confidence",
  release_gate: "Gate",
};
const TERMINAL = new Set<RunStatus>([
  "released",
  "gap_list",
  "failed",
  "cancelled",
]);

function canonicalForm(form: FormFile): unknown {
  return {
    ...form,
    inputs: [...form.inputs].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function mapError(e: unknown): RunError {
  if (e instanceof OrchestratorError)
    return { code: e.code, message: e.message, retryable: e.retryable };
  if (e instanceof GeminiHttpError)
    return {
      code: "MODEL_ERROR",
      message: `Model request failed (HTTP ${e.status})`,
      retryable: e.status === 429 || e.status >= 500,
    };
  if (e instanceof ModelMismatchError)
    return { code: "MODEL_ERROR", message: e.message, retryable: false };
  if (e instanceof MaxStepsError)
    return { code: "MODEL_ERROR", message: e.message, retryable: true };
  if (e instanceof EngineIntegrityError)
    return { code: "ENGINE_INTEGRITY", message: e.message, retryable: false };
  if (e instanceof EngineValidationError)
    return { code: "BAD_INPUT", message: e.message, retryable: false };
  if (
    e instanceof Error &&
    (e.name === "AbortError" || e.name === "TimeoutError")
  )
    return {
      code: "MODEL_TIMEOUT",
      message: "Model request timed out",
      retryable: true,
    };
  return {
    code: "MODEL_ERROR",
    message: e instanceof Error ? e.message : "Unknown error",
    retryable: false,
  };
}

/** The idempotency key: the project's form (inputs sorted) plus the engine versions. */
export function computeFormHash(form: FormFile): string {
  return hashOf({ form: canonicalForm(form), v: DEFAULT_CONFIG.versions });
}

export class RunOrchestrator {
  private view_: RunView;
  private seq = 0;
  private cancelled = false;

  constructor(private readonly d: OrchestratorDeps) {
    this.view_ = this.blank("idle");
  }

  get view(): RunView {
    return structuredClone(this.view_);
  }

  private blank(status: RunStatus, run_id: string | null = null): RunView {
    return {
      run_id,
      status,
      step: null,
      progress_pct: 0,
      checklist: CHECKLIST_LABELS.map((label) => ({
        label,
        state: "todo" as const,
      })),
      pending_question: null,
      mode: this.d.mode ?? "real",
    };
  }

  private emitView(patch: Partial<RunView>): void {
    this.view_ = { ...this.view_, ...patch };
    this.d.onView?.(structuredClone(this.view_));
  }

  private async event(
    run_id: string,
    step: string | null,
    type: string,
    payload: object,
  ): Promise<void> {
    this.seq += 1;
    await this.d.store.appendRunEvent({
      run_id,
      seq: this.seq,
      step,
      type,
      payload_json: JSON.stringify(payload),
      created_at: this.d.now(),
    });
  }

  private async guardAccess(): Promise<void> {
    if (this.d.checkAccess && !(await this.d.checkAccess(this.d.user_id)))
      throw new OrchestratorError("ACCESS_DENIED", "Access denied");
  }

  /** Mark labels up to and including `label` done and the next one as doing. */
  private advance(label: (typeof CHECKLIST_LABELS)[number]): void {
    const idx = CHECKLIST_LABELS.indexOf(label);
    const checklist: RunView["checklist"] = CHECKLIST_LABELS.map((l, i) => ({
      label: l,
      state: i <= idx ? "done" : i === idx + 1 ? "doing" : "todo",
    }));
    const done = checklist.filter((c) => c.state === "done").length;
    this.emitView({
      checklist,
      step: label,
      progress_pct: Math.round((100 * done) / checklist.length),
    });
  }

  // ---------- preflight ----------
  async preflight(): Promise<PreflightReport> {
    await this.guardAccess();
    this.cancelled = false;
    this.emitView({ ...this.blank("preflight"), step: "Pre-flight" });
    try {
      const form = await this.d.getForm();
      const ctx = createContext(form, {
        run_id: "preflight",
        now: this.d.now(),
        mode: this.d.mode ?? "real",
      });
      const details = callTool("preflight_gate", {}, ctx);
      const r = await runGuarded({
        apiKey: this.d.apiKey,
        model: this.d.models.assistant,
        system: ASSISTANT_SYSTEM,
        tools: TOOLS.filter((t) => ASSISTANT_TOOLS.includes(t.name)),
        ctx,
        userText: `Run the pre-flight for this project. ${intro(form)}`,
        role: "assistant",
        maxSteps: this.d.maxSteps ?? 16,
        ...(this.d.fetch ? { fetch: this.d.fetch } : {}),
        shouldStop: () => this.cancelled,
      });
      this.emitView({ ...this.blank("idle"), step: "Pre-flight done" });
      return {
        passed: (details as { passed: boolean }).passed,
        cancelled: false,
        message: r.text,
        details,
      };
    } catch (e) {
      if (e instanceof RunCancelledError) {
        this.emitView({ ...this.blank("cancelled"), step: "Cancelled" });
        return { passed: false, cancelled: true, message: "", details: null };
      }
      const error = mapError(e);
      this.emitView({
        ...this.blank("failed"),
        step: "Pre-flight failed",
        error,
      });
      return {
        passed: false,
        cancelled: false,
        message: error.message,
        details: null,
      };
    }
  }

  // ---------- run ----------
  async startRun(): Promise<RunOutcome> {
    await this.guardAccess();
    const { store } = this.d;
    const form = await this.d.getForm();
    const v = DEFAULT_CONFIG.versions;
    const form_hash = computeFormHash(form);

    // idempotent: the same project, form and versions give back the existing run
    const existing = await store.findRunByFormHash(
      this.d.project_id,
      form_hash,
    );
    if (
      existing &&
      (existing.status === "running" ||
        existing.status === "released" ||
        existing.status === "gap_list")
    ) {
      return this.outcomeFor(existing, true);
    }

    this.cancelled = false;
    this.seq = 0;
    const run_id = this.d.newRunId();
    await store.createRun({
      id: run_id,
      project_id: this.d.project_id,
      mode: this.d.mode ?? "real",
      form_hash,
      contract_version: v.contract,
      formula_version: v.formula,
      settings_version: v.settings,
      started_by: this.d.user_id,
      started_at: this.d.now(),
    });
    return this.executeRun(run_id, form);
  }

  /**
   * Runs the calculation for a run row that already exists (created by the agent or by startRun).
   * Safe to call again after a failed attempt: the event sequence continues where it stopped, and
   * a result is only saved once.
   */
  async executeRun(run_id: string, form?: FormFile): Promise<RunOutcome> {
    await this.guardAccess();
    const { store } = this.d;
    const f = form ?? (await this.d.getForm());
    const rec = await store.getRun(run_id);
    if (!rec) throw new OrchestratorError("BAD_INPUT", "Unknown run", false);
    if (rec.status === "cancelled") return this.cancelledOutcome(run_id);
    // a retry after a failed attempt starts the same run again
    if (rec.status === "failed")
      await store.updateRun(run_id, { status: "running", finished_at: null });
    const prior = await store.listRunEvents(run_id);
    this.seq = prior.reduce((m, e) => Math.max(m, e.seq), 0);
    this.cancelled = false;
    await this.event(run_id, null, "status", { status: "running" });
    this.emitView({ ...this.blank("running", run_id), step: "Files read" });
    this.advance("Files read");

    const ctx: ToolContext = createContext(f, {
      run_id,
      now: this.d.now(),
      mode: this.d.mode ?? "real",
    });
    let narrative: RunOutcome["narrative"] = null;
    try {
      const log = (e: GeminiEvent) => {
        void this.event(run_id, this.view_.step, e.type, e).catch(
          () => undefined,
        );
        if (e.type === "tool_call" && e.tool) {
          const label = TOOL_LABEL[e.tool];
          if (label) this.advance(label);
        }
      };
      const r = await runGuarded({
        apiKey: this.d.apiKey,
        model: this.d.models.calc,
        system: CALC_SYSTEM,
        tools: TOOLS.filter((t) => CALC_TOOLS.includes(t.name)),
        ctx,
        userText: `Run the full calculation loop now. ${intro(f)}`,
        role: "calc",
        maxSteps: this.d.maxSteps ?? 24,
        ...(this.d.fetch ? { fetch: this.d.fetch } : {}),
        ...(this.d.thinking ? { thinking: this.d.thinking } : {}),
        shouldStop: async () =>
          (await store.getRun(run_id))?.status === "cancelled",
        log,
        onReject: (dg, attempt) => {
          void this.event(run_id, this.view_.step, "text_rejected", {
            attempt,
            sentence_hash: hashOf(dg.sentence),
          }).catch(() => undefined);
        },
      });
      if (r.status === "paused")
        throw new OrchestratorError(
          "NOT_SUPPORTED",
          "Mid-run questions are not supported",
          false,
        );
      narrative = { source: r.source, text: r.text };
      // the engine result is the model's compute_project output; if it never ran, the engine runs it
      const output =
        ctx.state.last ?? (callTool("compute_project", {}, ctx) as RunOutput);
      const current = await store.getRun(run_id);
      if (current?.status === "cancelled") return this.cancelledOutcome(run_id);
      this.advance("Narrative");
      if (!(await store.getResult(run_id)))
        await store.saveResult(run_id, output, this.d.now());
      const status: RunStatus =
        output.kind === "result" ? "released" : "gap_list";
      await store.updateRun(run_id, { status, finished_at: this.d.now() });
      await this.event(run_id, "Narrative", "status", {
        status,
        narrative_source: r.source,
        narrative_hash: hashOf(r.text),
      });
      this.emitView({
        status,
        step: status === "released" ? "Released" : "Gap list",
        progress_pct: 100,
      });
      return { view: this.view, run_id, output, narrative, reused: false };
    } catch (e) {
      if (e instanceof RunCancelledError) return this.cancelledOutcome(run_id);
      const error = mapError(e);
      await store.updateRun(run_id, {
        status: "failed",
        finished_at: this.d.now(),
        error,
      });
      await this.event(run_id, this.view_.step, "error", {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      }).catch(() => undefined);
      const checklist = this.view_.checklist.map((c) =>
        c.state === "doing" ? { ...c, state: "error" as const } : c,
      );
      this.emitView({ status: "failed", error, checklist });
      return {
        view: this.view,
        run_id,
        output: null,
        narrative,
        reused: false,
      };
    }
  }

  private async outcomeFor(
    rec: RunRecord,
    reused: boolean,
  ): Promise<RunOutcome> {
    const row = await this.d.store.getResult(rec.id);
    const json = row?.result_json ?? row?.gap_list_json ?? null;
    const output = json ? (JSON.parse(json) as RunOutput) : null;
    const view = this.blank(rec.status, rec.id);
    view.progress_pct = TERMINAL.has(rec.status) ? 100 : 0;
    view.checklist = view.checklist.map((c) => ({
      ...c,
      state: TERMINAL.has(rec.status) ? ("done" as const) : c.state,
    }));
    this.emitView(view);
    return { view: this.view, run_id: rec.id, output, narrative: null, reused };
  }

  private cancelledOutcome(run_id: string): RunOutcome {
    this.emitView({ status: "cancelled", step: "Cancelled" });
    return {
      view: this.view,
      run_id,
      output: null,
      narrative: null,
      reused: false,
    };
  }

  // ---------- questions (tabled) ----------
  /** ask_user is tabled until after the demo, so there is never a pending question to answer. */
  answerQuestion(
    _questionId: string,
    _answer: unknown,
  ): Promise<{ ok: false; error: RunError }> {
    return Promise.resolve({
      ok: false,
      error: {
        code: "NOT_SUPPORTED",
        message: "Mid-run questions are not supported yet",
        retryable: false,
      },
    });
  }

  // ---------- cancel ----------
  async cancelRun(): Promise<RunView> {
    await this.guardAccess();
    const st = this.view_.status;
    if (st === "preflight") {
      this.cancelled = true; // preflight has no run row; the loop stops before its next request
      this.emitView({ status: "cancelled", step: "Cancelled" });
    } else if (st === "running" && this.view_.run_id) {
      this.cancelled = true;
      await this.d.store.cancel(this.view_.run_id, this.d.now());
      await this.event(this.view_.run_id, this.view_.step, "status", {
        status: "cancelled",
      }).catch(() => undefined);
      this.emitView({ status: "cancelled", step: "Cancelled" });
    }
    return this.view;
  }
}
