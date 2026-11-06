import { AgentWorkflow } from "agents/workflows";
import type { AgentWorkflowEvent, AgentWorkflowStep } from "agents/workflows";
import { NonRetryableError } from "cloudflare:workflows";
import type { ValueIQAgent } from "./valueiq-agent";
import { makeOrchestrator, runStoreFor } from "../app/server/run-wiring.server";
import { OrchestratorError } from "../assistant/run/orchestrator";
import {
  RETRY_DELAY,
  RETRY_LIMIT,
  isFinalAttempt,
  shouldRetry,
} from "../assistant/run/retry";
import type { RunView } from "../shared/types";

/** What the agent passes to `runWorkflow("RUN_WORKFLOW", params, { id: runId })`. */
export type CalculationRunParams = { runId: string; projectId: string };
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
        let orch;
        try {
          orch = makeOrchestrator({
            projectId,
            userId,
            store,
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
        const out = await orch.executeRun(runId);
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
