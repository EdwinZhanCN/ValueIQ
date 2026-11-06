/**
 * The calculation run as a Cloudflare Workflow (integration contract section 1).
 * The workflow instance id is the run id; `ValueIQAgent.startRun` creates the
 * run row and starts this with `runWorkflow("RUN_WORKFLOW", params, { id })`.
 *
 * Steps are durable and retried:
 *   1. `check-run`  - the run exists, belongs to the project and the starting
 *                     user, is not cancelled, and that user is still on the team.
 *   2. `calculate`  - the orchestrator's calc-model tool loop, the narrative
 *                     guard and the engine fallback; saves the RunOutput through
 *                     the D1 store (result_json xor gap_list_json). A retryable
 *                     failure (model 429/5xx, timeout) throws so the step retries
 *                     with exponential backoff; anything else is non-retryable.
 *
 * No ask_user wait: it is tabled. Models and the key come from the Worker env
 * through `makeOrchestrator`; nothing here names a model or reads the key.
 */
import { AgentWorkflow } from "agents/workflows";
import type { AgentWorkflowEvent, AgentWorkflowStep } from "agents/workflows";
import { NonRetryableError } from "cloudflare:workflows";
import type { ValueIQAgent } from "../agents/valueiq-agent";
import { makeOrchestrator } from "../app/server/run-wiring.server";
import { runStoreFor } from "../app/server/runs.server";
import {
  RETRY_DELAY,
  RETRY_LIMIT,
  isFinalAttempt,
  shouldRetry,
} from "../assistant/run/retry";
import type { RunView } from "../shared/types";

export type RunParams = { runId: string; projectId: string; userId: string };
/** What the workflow reports to the agent's `onWorkflowProgress`. */
export type RunProgress = { view: RunView };

export class CalculationRun extends AgentWorkflow<
  ValueIQAgent,
  RunParams,
  RunProgress,
  Env
> {
  async run(event: AgentWorkflowEvent<RunParams>, step: AgentWorkflowStep) {
    const { runId, projectId, userId } = event.payload;

    await step.do("check-run", async () => {
      const store = runStoreFor({ userId, projectId });
      await store.assertAccess().catch(() => {
        throw new NonRetryableError("ACCESS_DENIED: not on the team");
      });
      const rec = await store.getRun(runId);
      if (!rec || rec.started_by !== userId)
        throw new NonRetryableError("BAD_INPUT: unknown run");
      if (rec.status === "cancelled")
        throw new NonRetryableError("CANCELLED: run was cancelled");
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
        const pending: Promise<void>[] = [];
        const orch = makeOrchestrator({
          projectId,
          userId,
          store: runStoreFor({ userId, projectId }),
          onView: (view) => {
            // A retryable failure is not shown as failed until the last attempt.
            if (
              view.status === "failed" &&
              view.error &&
              shouldRetry(view.error, ctx.attempt)
            )
              return;
            pending.push(this.reportProgress({ view }).catch(() => undefined));
          },
        });
        const out = await orch.executeRun(runId);
        await Promise.all(pending);
        const err = out.view.error;
        if (out.view.status === "failed" && err) {
          if (shouldRetry(err, ctx.attempt) && !isFinalAttempt(ctx.attempt))
            throw new Error(`${err.code}: ${err.message}`);
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
