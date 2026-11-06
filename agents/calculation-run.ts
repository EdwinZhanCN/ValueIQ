import { AgentWorkflow } from "agents/workflows";
import type { ValueIQAgent } from "./valueiq-agent";

/** What the agent passes to `runWorkflow("RUN_WORKFLOW", params, { id: runId })`. */
export type CalculationRunParams = { runId: string; projectId: string };

/**
 * The calculation run (integration contract section 1). Owner: Eli.
 *
 * Placeholder only, so the `RUN_WORKFLOW` binding deploys. Nothing starts it
 * yet, and it refuses to run rather than pretend to calculate. The stub
 * steps, `ask_user`, and the real engine replace this body.
 */
export class CalculationRun extends AgentWorkflow<
  ValueIQAgent,
  CalculationRunParams
> {
  run(): Promise<never> {
    return Promise.reject(new Error("CalculationRun is not implemented yet."));
  }
}
