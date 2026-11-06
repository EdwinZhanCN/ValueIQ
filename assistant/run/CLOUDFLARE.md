# Cloudflare readiness for the calculation run

Status (Nov 5): the run logic is finished and tested without Cloudflare. `assistant/run/orchestrator.ts` implements the contract's states `idle -> preflight -> running -> released | gap_list`, plus `failed` and `cancelled`, against the `RunStore` interface (`assistant/run/types.ts`, in-memory version in `memory-store.ts`). All model calls go through `assistant/gemini.ts` (the Vercel AI SDK, `ai` + `@ai-sdk/google`, used only as a library inside the Worker); the engine is called through `assistant/tools.ts`. Nothing under `assistant/run/` uses a Node-only API (only `assistant/live-run.ts` and `scripts/` do, and the run code does not import them).

`blocked_on_question` stays in the shared `RunView` type but is **not implemented**: `ask_user` is tabled until after the demo, so `answerQuestion()` returns `{ ok: false, error: { code: "NOT_SUPPORTED" } }` and the model is not offered the tool. When it returns, the pause is already a plain return (`runGuarded` returns `status: "paused"` with the questions and the saved conversation), which a Workflow can turn into `step.waitForEvent`.

## What Zihao provides (contract sections 1, 4, 5, 7)

1. **Tables** (Drizzle + migration), columns exactly as contract section 4: `runs`, `run_events` (PK `run_id, seq`), `run_results` (CHECK: exactly one of `result_json`, `gap_list_json`). `run_questions` is **later** (needed only when `ask_user` returns).
2. **`shared/types.ts`** with `Question`, `RunView`, `RunStatus`, `RunError`, and the `FormFile`, `RunOutput`, `Result`, `GapList` types (copy from `assistant/run/types.ts` and `engine/types.ts`; no `any` across tracks).
3. **`RUN_WORKFLOW` binding** and the exported `CalculationRun` class (`AgentWorkflow`) in `workers/app.ts`, declared in `wrangler.jsonc` at top level and per environment (contract section 1).
4. **Agent access gate**: `onBeforeConnect` / `onBeforeRequest` with `checkProjectAccess`, forwarding `x-valueiq-user-id` (section 7). The agent passes that user id into the orchestrator and implements `checkAccess` by re-reading team membership in D1.
5. **Secrets**: `GEMINI_API_KEY` as a Worker secret and listed in `secrets.required` for dev and prod. Optional vars: `GEMINI_MODEL_ASSISTANT`, `GEMINI_MODEL_CALC`, `GEMINI_THINKING_CALC`.
6. **Server functions** the adapter calls: `getProjectForm`, `createRun`, `appendRunEvent`, `finishRun`, `getRun`, `getLatestResult` (contract section 5), project-scoped.

## Thin adapter code that remains (Eli)

| Piece                                  | What it does                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D1RunStore implements RunStore`       | One method per `RunStore` member over the three tables. `saveResult` writes `JSON.stringify(out)` to `result_json` or `gap_list_json` (never both); `appendRunEvent` uses the caller's `seq`; `findRunByFormHash` selects on `(project_id, form_hash)` newest first; `cancel` updates only active rows. Timestamps become integer ms.                                         |
| `CalculationRun extends AgentWorkflow` | `run(event, step)`: `step.do("run", () => orchestrator.startRun())` for the demo (one durable step; the orchestrator is already idempotent for the same form hash, so a retried step does not start a second run). Report progress with `reportProgress` from the `onView` callback. Later, split into `step.do` calls and add `step.waitForEvent("ask-<id>")` for questions. |
| `ValueIQAgent` methods                 | `@callable() preflight()`, `startRun()` (starts `runWorkflow("RUN_WORKFLOW", { project_id }, { id: runId })`), `answerQuestion()` (returns NOT_SUPPORTED for now), `cancelRun()` (`terminateWorkflow(runId)` and `orchestrator.cancelRun()`). `onWorkflowProgress` copies `RunView` into agent state.                                                                         |
| Wiring                                 | `new RunOrchestrator({ store, project_id, user_id, getForm, apiKey: env.GEMINI_API_KEY, models: resolveModels(env), thinking: resolveThinking(env), now: () => new Date().toISOString(), newRunId: () => crypto.randomUUID(), checkAccess, onView })`. The default global `fetch` works in Workers.                                                                           |

## Notes

- Run events hold only event types, step names, ids, hashes, token counts and error codes; no prompts, files or keys.
- The result stored is exactly the engine's `RunOutput`. The model's narrative text is returned in `RunOutcome.narrative` (with `source: "model" | "engine"`) but is not stored; add a column or event field later if the report needs it.
- Error codes follow contract section 8: `MODEL_ERROR` (retryable for 429 and 5xx), `MODEL_TIMEOUT`, `ENGINE_INTEGRITY`, `BAD_INPUT`, `ACCESS_DENIED`, `NOT_SUPPORTED`.
- The Workers runtime has not been measured yet (K15 was measured in Node).
