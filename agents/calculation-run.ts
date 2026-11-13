import { AgentWorkflow } from "agents/workflows";
import type { AgentWorkflowEvent, AgentWorkflowStep } from "agents/workflows";
import { NonRetryableError } from "cloudflare:workflows";
import type { ValueIQAgent } from "./valueiq-agent";
import {
  makeOrchestrator,
  runEngineConfig,
  runStoreFor,
} from "../app/server/run-wiring.server";
import { OrchestratorError } from "../assistant/run/orchestrator";
import {
  RETRY_DELAY,
  RETRY_LIMIT,
  isFinalAttempt,
  shouldRetry,
} from "../assistant/run/retry";
import type { RunView } from "../shared/types";
import { CHECKLIST_LABELS } from "../assistant/run/types";
import {
  SIMULATED_FAILURE_MESSAGE,
  demoControlsOn,
} from "../app/lib/demo-controls";

/** What the agent passes to `runWorkflow("RUN_WORKFLOW", params, { id: runId })`. */
export type CalculationRunParams = {
  runId: string;
  projectId: string;
  /** Demo control (L3 #80): end this run with a labelled, simulated failure. */
  simulateFailure?: boolean;
};
/** What the workflow reports to the agent's `onWorkflowProgress`. */
export type RunProgress = { view: RunView };

/**
 * The calculation run (integration contract section 1). Owner: Eli.
 *
 * The workflow instance id is the run id. The user is the run's `started_by`,
 * read from the row (not passed as a parameter). Steps:
 *   1. `check-run`: the run exists in this project, is not ended, and its
 *      starting user is still on the team.
 *   2. `calculate`: the real engine and Gemini tool loop through the
 *      orchestrator's `executeRun`; the result or gap list is saved with
 *      `finishRun`. A retryable model failure throws so the step retries with
 *      backoff; the run only ends `failed` on the last attempt.
 *
 * `ask_user` is tabled: there is no wait step. No stub path.
 */
export class CalculationRun extends AgentWorkflow<
  ValueIQAgent,
  CalculationRunParams,
  RunProgress,
  Env
> {
  async run(
    event: AgentWorkflowEvent<CalculationRunParams>,
    step: AgentWorkflowStep,
  ) {
    const { runId, projectId } = event.payload;

    const userId = await step.do("check-run", async () => {
      const rec = await runStoreFor({ userId: null, projectId }).getRun(runId);
      if (!rec) throw new NonRetryableError("BAD_INPUT: unknown run");
      if (rec.status === "cancelled")
        throw new NonRetryableError("CANCELLED: run was cancelled");
      if (rec.finished_at)
        throw new NonRetryableError("BAD_INPUT: run already ended");
      await runStoreFor({ userId: rec.started_by, projectId })
        .assertAccess()
        .catch(() => {
          throw new NonRetryableError("ACCESS_DENIED: not on the team");
        });
      return rec.started_by;
    });

    if (event.payload.simulateFailure) {
      // No model call and no automatic retry: the run moves past its first
      // progress step, then ends failed with an error event that says it was
      // simulated. Retry starts an ordinary run.
      await step.do("simulate-failure", async () => {
        if (!demoControlsOn(this.env as unknown as Record<string, unknown>))
          throw new NonRetryableError("BAD_INPUT: demo controls are off");
        const store = runStoreFor({ userId, projectId });
        let seq = (await store.listRunEvents(runId)).reduce(
          (last, e) => Math.max(last, e.seq),
          0,
        );
        const append = (step_: string | null, type: string, payload: object) =>
          store.appendRunEvent({
            run_id: runId,
            seq: ++seq,
            step: step_,
            type,
            payload_json: JSON.stringify(payload),
            created_at: new Date().toISOString(),
          });
        await append(null, "status", { status: "running", simulated: true });
        const checklist = CHECKLIST_LABELS.map((label, i) => ({
          label,
          state:
            i === 0
              ? ("done" as const)
              : i === 1
                ? ("doing" as const)
                : ("todo" as const),
        }));
        await this.reportProgress({
          view: {
            run_id: runId,
            status: "running",
            step: CHECKLIST_LABELS[0],
            progress_pct: Math.round(100 / CHECKLIST_LABELS.length),
            checklist,
            pending_question: null,
            mode: (await store.getRun(runId))?.mode ?? "real",
          },
        }).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await append(CHECKLIST_LABELS[1], "error", {
          code: "MODEL_ERROR",
          message: SIMULATED_FAILURE_MESSAGE,
          retryable: true,
          simulated: true,
        });
        await store.finalizeFailed(runId);
        return true;
      });
      throw new NonRetryableError(`MODEL_ERROR: ${SIMULATED_FAILURE_MESSAGE}`);
    }

    const done = await step.do(
      "calculate",
      {
        retries: {
          limit: RETRY_LIMIT,
          delay: RETRY_DELAY,
          backoff: "exponential",
        },
        timeout: "10 minutes",
      },
      async (ctx) => {
        const store = runStoreFor({ userId, projectId });
        // A retryable failure must not end the run before the last attempt.
        store.deferFailure = true;
        const pending: Promise<void>[] = [];
        let out;
        try {
          const config = await runEngineConfig(store, projectId, runId);
          const orch = makeOrchestrator({
            projectId,
            userId,
            store,
            config,
            onView: (view) => {
              if (
                view.status === "failed" &&
                view.error &&
                shouldRetry(view.error, ctx.attempt)
              )
                return;
              pending.push(
                this.reportProgress({ view }).catch(() => undefined),
              );
            },
          });
          // A non-retryable setup failure (no key, no pinned form) ends the run
          // now; retrying cannot fix it and would leave the row `running`.
          out = await orch.executeRun(runId);
        } catch (error) {
          if (error instanceof OrchestratorError && !error.retryable) {
            const events = await store.listRunEvents(runId);
            await store.appendRunEvent({
              run_id: runId,
              seq:
                events.reduce((last, event) => Math.max(last, event.seq), 0) +
                1,
              step: "Setup",
              type: "error",
              payload_json: JSON.stringify({
                code: error.code,
                message: error.message,
                retryable: false,
              }),
              created_at: new Date().toISOString(),
            });
            await store.finalizeFailed(runId);
            throw new NonRetryableError(`${error.code}: ${error.message}`);
          }
          throw error;
        }
        await Promise.all(pending);
        const err = out.view.error;
        if (out.view.status === "failed" && err) {
          if (shouldRetry(err, ctx.attempt) && !isFinalAttempt(ctx.attempt))
            throw new Error(`${err.code}: ${err.message}`);
          await store.finalizeFailed(runId);
          throw new NonRetryableError(`${err.code}: ${err.message}`);
        }
        // Heavy data stays in D1: only the status and the narrative source come back.
        return {
          status: out.view.status,
          narrative_source: out.narrative?.source ?? null,
        };
      },
    );

    await step.reportComplete({ run_id: runId, ...done });
    return done;
  }
}
