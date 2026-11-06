# Cloudflare integration notes (calculation run, #64)

Branch `feature/64-cloudflare-run-integration`. Eli reads every line; Zihao reviews the items under "Needs Zihao".

## What was built

| Piece        | Where                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tables       | `db/schema.ts` and `drizzle/0001_*.sql`: `runs`, `run_events` (PK run_id, seq), `run_results` (CHECK exactly one JSON column). `run_questions` and `run_reports` are not built.                              |
| Shared types | `shared/types.ts`: `Question`, `RunView`, `RunStatus`, `RunError` (with the section 8 codes plus `NOT_SUPPORTED`), type re-exports from `engine/types`.                                                      |
| Server fns   | `app/server/runs.server.ts` (`createRun`, `appendRunEvent`, `finishRun`, `getRun`, `getLatestResult`) over `app/server/run-store.server.ts` (`D1RunStore implements RunStore`).                              |
| Access gate  | `app/server/agent-gate.server.ts`, wired in `workers/app.ts` (`routeAgentRequest` first, `onBeforeConnect` and `onBeforeRequest`).                                                                           |
| Agent        | `agents/valueiq-agent.ts`: state is the `RunView`; `@callable` `preflight`, `startRun`, `cancelRun`, `answerQuestion` (NOT_SUPPORTED); `onConnect` keeps the gate's user id; workflow callbacks.             |
| Workflow     | `workers/calculation-run.ts`: `CalculationRun extends AgentWorkflow`; steps `check-run` and `calculate`; retry policy in `assistant/run/retry.ts`.                                                           |
| Wiring       | `app/server/run-wiring.server.ts`: builds the `RunOrchestrator` (D1 store, saved form, models from `assistant/models.ts`, `env.GEMINI_API_KEY`).                                                             |
| Orchestrator | `assistant/run/orchestrator.ts`: new `executeRun(run_id)` (the agent creates the run, the workflow executes it; safe to repeat), `computeFormHash`, error events now carry the message.                      |
| Config       | `wrangler.jsonc` workflow bindings (`valueiq-run`, `valueiq-dev-run`, `valueiq-prod-run`); `GEMINI_API_KEY` in `secrets.required` for top level and `development` only; `vite.config.ts` adds `agents/vite`. |
| Tests        | `app/server/tests/` (D1 store and orchestrator on a `node:sqlite` D1 shim, gate), `assistant/tests/retry.test.ts`, agent routes in `scripts/access-matrix.mjs`. `test:engine` includes the new unit tests.   |

## SDK facts verified (agents 0.23.0, from node_modules types and docs)

- `routeAgentRequest(request, env, { onBeforeConnect, onBeforeRequest })`: both receive `(request, { className, name })` and may return a `Response` (reject), a `Request` (forward modified), or nothing. `className` is the Durable Object binding name (`ValueIQAgent`). Verified live: refused WebSocket handshakes never open, and a client-sent `x-valueiq-user-id` is overwritten.
- `Agent.onConnect(connection, { request })`, `connection.setState` and `getCurrentAgent().connection` give the per-connection user id in callable methods.
- `runWorkflow(binding, params, { id })`, `terminateWorkflow(id)`, `sendWorkflowEvent` exist on `Agent`; callbacks are `onWorkflowProgress(name, id, progress)`, `onWorkflowComplete(name, id, result?)`, `onWorkflowError(name, id, errorString)`. In `AgentWorkflow`: `reportProgress(obj)`, `step.reportComplete`, `step.reportError`.
- RPC over the WebSocket uses `{type:"rpc", id, method, args}` and answers `{type:"rpc", id, success, result}`; state arrives as `{type:"cf_agent_state"}`. The access matrix exercises this.

### Where the contract and the SDK differ or were silent

1. `@callable()` needs the `agents/vite` plugin (Vite 8 / Oxc has no TC39 decorators). That plugin resolves `@babel/plugin-proposal-decorators` from the project root, and pnpm does not hoist it, so it is added as a **devDependency** (`^8.0.2`, same version `agents` already depends on). Without it `pnpm dev` and the smoke test crash on the first file.
2. The orchestrator's `startRun` creates the run itself. The contract has the agent create the row and the workflow instance share its id, so `executeRun(run_id)` was split out; `startRun` still works for tests.
3. Workflow callbacks "write run_events": the orchestrator inside the workflow is the only writer during a run (it owns `seq`), so `onWorkflowProgress` only updates the view. The agent appends events (`workflow_complete`, `workflow_error`, cancel) with the next free `seq` only after the workflow has stopped.
4. `GEMINI_API_KEY` is typed optional in the generated `Env` (production does not declare it), so the code treats a missing key as a `MODEL_ERROR`, never a mock.

## Decisions

- **Preflight is not a workflow step.** `preflight()` is a cheap-model agent call (already a single short loop); the calculation loop includes the deterministic gate. Putting it in the workflow would add cost and latency for no durability gain.
- **One durable `calculate` step**, not one per tool: the Gemini tool loop holds conversation state in memory and cannot be split without persisting it. The step is idempotent: a retry continues the event `seq`, restarts a `failed` run row, and saves the result only if none exists. Retryable failures (429, 5xx, timeout) throw so the step retries 3 times with exponential backoff from 10 s; a failed view is only shown on the last attempt. Everything else is `NonRetryableError`.
- **Heavy data stays out of state and step results**: the step returns status and narrative source only; the RunOutput goes to `run_results`. The narrative text is not stored (as before).
- **No `error` column** on `runs` (contract lists none): a failed run's error is rebuilt from its last `error` event, which now includes `message`.
- **Idempotent `createRun`**: same project, form hash and versions returns the existing running, released or gap-list run; a failed or cancelled run starts a new one.
- **System scope.** `D1RunStore` with `userId: null` skips the membership check (still project-scoped). It is used only by the agent's own workflow callbacks, where no user is present. User-driven paths (`preflight`, `startRun`, `cancelRun`, the workflow's own store) always check membership.
- `answerQuestion` returns a typed `NOT_SUPPORTED`. `chat()` is not built (undecided, out of scope).
- Callable methods return `{ok, value}` or `{ok:false, error}` instead of throwing, so the UI gets the section 8 codes.
- Merged `origin/develop` into the branch first: the form server functions and the access matrix landed there after `feature/84-engine-core` was cut.

## Needs Zihao

1. **Migration `drizzle/0001_*.sql`**: column types, FKs (`ON DELETE CASCADE` from `projects`), the index `runs_project_form_idx`, and the CHECKs.
2. **Access gate** (`app/server/agent-gate.server.ts`, `workers/app.ts`) and the system-scope store.
3. **`wrangler.jsonc`**: workflow bindings; `GEMINI_API_KEY` in `secrets.required` for local and development.
4. **Production secret**: `GEMINI_API_KEY` is deliberately not in the production `secrets.required` list. Before prod runs work, `wrangler secret put GEMINI_API_KEY --env production` and add it to the list.
5. **`shared/types.ts`** and the lifted wording in `AGENTS.md` and `docs/architecture.md`.
6. The new dev dependency, and CI: `.dev.vars` in CI has only `BETTER_AUTH_SECRET`; smoke and the access matrix pass without the Gemini key (the matrix has a block that starts a real workflow run and expects it to fail as `MODEL_ERROR` when no key is configured; it is skipped if `.dev.vars` has `GEMINI_API_KEY`).

## Not tested without a deployed Worker or the key

- A real Gemini call from workerd (K15 timing was measured in Node only), and the 10-minute step timeout under real latency.
- Retry/backoff against a real 429 or 5xx (the policy is unit-tested; the live path only ran the no-key failure).
- `terminateWorkflow` against a running remote workflow, hibernation of the agent mid-run, and `valueiq-dev` deployment.
- A browser client (`useAgent`); the matrix speaks the wire format directly.
