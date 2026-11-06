# Integration contract: how the pieces connect

Status: active - 2026-11-05, Zihao's review edits applied (VERIFY items resolved, infrastructure names set, Q2-Q4 and Q13 answered in #88-#90 and #99); the contracts below freeze when the pull request for #108 merges. This plan fixes the shared ground rules for connecting the input form, intake assistant, calculation run, `ask_user`, and results/PDF. It adds no code, tables, or bindings: the shells in `AGENTS.md` stay empty until each owner's slice lands. Author: Eli. Reviewer and owner of infrastructure: Zihao. Tracked in #108 (review), #64 (Z8), #72 (A1).

Goal: a person on `valueiq-dev` saves a form, talks to the intake assistant, starts a calculation run that can stop to ask one question, and opens a result page, with every step running on Cloudflare and every track building to the same interfaces. First observable milestone: a labeled stub run end to end by Sat Nov 7 (Phase 1), so Nov 8-10 only swaps stubs for real parts.

## Non-goals

- The per-track plans (input form and defaults, intake assistant prompts, calculation tools and engine formulas, output/report design) and the research behind them. They follow in separate pull requests and may refine, never silently contradict, this plan.
- Column details beyond section 4 (indexes, foreign-key actions). Zihao settles them in the migration pull request.
- Identity, teams, and file storage design: owned by [`interim-foundation.md`](interim-foundation.md), whose scope and STOP 2 date this plan does not change. This plan builds on its Phases 1-3 and only states what it additionally needs from it.
- Any real numbers. Until the engine plan lands, every run is a stub and must say so.

## Rules for every agent and human

1. Build native to the repo: Workers, D1 through Drizzle, R2, Durable Objects through the Agents SDK, Cloudflare Workflows. No separate server, database, or queue outside Cloudflare (Q4, #90). Model calls go from the Worker to Gemini with one team-held `GEMINI_API_KEY` per environment as a Worker secret; there is no key screen (Q3, #89).
2. Follow `AGENTS.md`: server-only code in `.server.ts` modules or loaders and actions, generated files stay generated (`pnpm typegen`), migrations come from `db/schema.ts` via `pnpm db:generate` and a merged migration is never edited, no secrets in git.
3. Zihao owns identity, access, tables, storage, deploy, and secrets. Others propose changes to those in a pull request against this plan or in #108; they do not create tables, buckets, or auth code on their own.
4. Never present mock or scripted output as a real assessment. A stub run carries `mode: "stub"` in its data and a visible STUB label in the UI.
5. Code computes; models collect, route, and explain. A model never produces or changes a number that is displayed as a result.
6. A change to a shared type, method name, table, or event needs a pull request to this plan and an acknowledgement from each affected owner.

## Fixed contracts (freeze at merge)

### 1. Runtime shape

- One `ValueIQAgent` Durable Object per project; the instance name is the project id. Browsers connect with the Agents SDK `useAgent` on the SDK's default route `/agents/:agent/:name`; the SDK kebab-cases the binding name, so the path is `/agents/value-i-q-agent/{projectId}`. `workers/app.ts` calls `routeAgentRequest` first and hands unmatched requests to React Router.
- Agent state synced to clients holds only a small run view (type below). Heavy data stays out of agent state: form in D1 `project_forms`, files in R2 through `files`, runs and results in D1.
- The calculation run is a Cloudflare Workflow: class `CalculationRun` extending `AgentWorkflow`, exported from `workers/app.ts`, binding `RUN_WORKFLOW`. `wrangler.jsonc` declares it at the top level (`valueiq-run`) and in each environment (`valueiq-dev-run`, `valueiq-prod-run`), as it does the Durable Object binding. The agent starts it with `runWorkflow("RUN_WORKFLOW", params, { id: runId })`, so the workflow instance id is the run id. It may pause for a person (section 6). Steps are durable and retried; progress reaches the agent through `reportProgress` and durable state updates.
- The deterministic engine is a plain TypeScript library with no I/O, imported by the workflow, the agent tools, and unit tests.
- Gemini is called from the Worker; every model output that feeds the engine is schema-validated first.
- Browser-callable agent methods use `@callable()` and treat arguments as untrusted. Server-to-server calls use Durable Object RPC through `getAgentByName`.

### 2. Run states

`idle -> preflight -> running -> (blocked_on_question -> running) -> released | gap_list`, with `failed` and `cancelled` reachable from any active state. `gap_list` means no headline result and a ranked list of what evidence is missing. A run is repeatable for identical inputs and versions; edited inputs create a new run and old runs are kept.

### 3. Shared types (one definition in `shared/types.ts`, imported by every track)

```ts
export interface Question {
  id: string;
  run_id: string;
  text: string;
  why_blocking: string;
  affects: string[];
  options: ("value" | "use_proxy" | "exclude")[];
}
export interface RunView {
  run_id: string | null;
  status:
    | "idle"
    | "preflight"
    | "running"
    | "blocked_on_question"
    | "released"
    | "gap_list"
    | "failed"
    | "cancelled";
  step: string | null;
  progress_pct: number;
  checklist: { label: string; state: "todo" | "doing" | "done" | "error" }[];
  pending_question: Question | null;
  error?: { code: string; message: string; retryable: boolean };
  mode: "real" | "stub";
}
// FormFile, Result, and GapList are versioned JSON types defined in the
// per-track plans (input form; engine and output). This plan only requires:
// stored opaquely, validated against the shared type on every read and write,
// and carrying a contract_version.
```

No `any` across track boundaries.

### 4. Tables (Zihao implements)

Already planned in [`interim-foundation.md`](interim-foundation.md): `projects`, `project_forms`, `files`, and `team_settings` (Q2, #88: the team's financial defaults, replacing `team_goals`; append-only, so `runs.settings_version` pins the settings a run used). Additions:

| Table           | Columns                                                                                                                           | Phase | Purpose                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------- |
| `runs`          | id, project_id, status, mode, form_hash, contract_version, formula_version, settings_version, started_by, started_at, finished_at | 1     | one row per run; the id is also the workflow instance id |
| `run_events`    | run_id, seq, step, type, payload_json, created_at; PK (run_id, seq)                                                               | 1     | append-only audit log; the agent assigns `seq`           |
| `run_questions` | id, run_id, payload_json, answer_json, answered_by, asked_at, answered_at                                                         | 1     | `ask_user` history                                       |
| `run_results`   | run_id (PK), result_json, gap_list_json, created_at                                                                               | 1     | CHECK: exactly one of the two JSON columns is set        |
| `run_reports`   | id, run_id, r2_key, created_by, created_at                                                                                        | 2     | report PDF storage                                       |

Column types: ids are text, as in Better Auth's tables; timestamps are integer milliseconds (`integer({ mode: "timestamp_ms" })`); JSON columns are text (`text({ mode: "json" })`); `status` and `mode` are text with a CHECK on the allowed values. Whether a run released a result or a gap list is read from `runs.status`, not stored twice. Report PDFs go in the existing `FILES` bucket under `teams/{teamId}/projects/{projectId}/reports/{runId}/{reportId}.pdf`; no new bucket.

Every row is reached only through server functions that run the project access check.

### 5. Server functions

Output release integration (2026-11-06): canonical infrastructure signatures remain in `runs.server.ts`. `finishRun` validates complete RunOutput envelopes and atomically prevents overwriting terminal data. Project-scoped consumer reads live in `output-runs.server.ts`; report generation/download live in `reports.server.ts`. The additive report migration follows merged `0001_runs.sql`. See [concrete handoff](../../../docs/output-pipeline.md). The pushed engine and PR #138 Worker orchestration are included; output UI launch wiring is still pending.

Existing in [`interim-foundation.md`](interim-foundation.md): `getProjectForm`, `saveProjectForm`, `listProjectFiles`, `readProjectFile`, `requireProjectAccess`, and its core `checkProjectAccess(request, projectId)`, which returns `{ userId, role }` or `signed_out` / `forbidden` without building a response. Additions in Phase 1 (in `app/server/runs.server.ts`): `createRun`, `appendRunEvent`, `finishRun`, `getRun`, `getLatestResult`, plus `updateRunStatus`, `recordRunQuestion`, and `answerRunQuestion` for the `blocked_on_question` round trip, and `getProjectMembership(projectId, userId)` in `access.server.ts` for the section 6 re-check. Additions in Phase 2: `readProjectFileForModel(fileId)` (bytes or text plus mime for Gemini, project-scoped, size-limited), `saveReportPdf`, `getReportPdf`. Callers never receive a raw D1 or R2 handle outside these modules.

### 6. Agent methods

Browser-callable: `chat(message)` (streaming), `preflight()`, `startRun()`, `answerQuestion(questionId, answer)`, `cancelRun()`. Workflow callbacks (`onWorkflowProgress`, `onWorkflowComplete`, `onWorkflowError`) update the run view and write `run_events`.

- Each connection carries the caller's user id in connection state, set in `onConnect` from the header the access gate writes (section 7). `started_by` and `answered_by` come from it, never from arguments.
- `startRun`, `answerQuestion`, and `cancelRun` re-check team membership in D1 for that user id and fail with `ACCESS_DENIED` if it is gone; `chat` and `preflight` rely on the connection check.
- `ask_user`: the workflow records the question (`run_questions` row and `pending_question`) in a durable step, then waits on an event typed to that question. `answerQuestion` checks that the question is pending, belongs to the current run, and that the answer matches its schema; it stores the answer, then resumes the workflow. The per-question event type keeps a late answer from resuming a later wait. Question ids use only letters, digits, and `-`. A timeout ends the run as `failed` with `QUESTION_TIMEOUT`, `retryable: true`.
- `cancelRun` calls `terminateWorkflow(runId)` and ends the run as `cancelled`.

```ts
// CalculationRun (workflow)
const answer = await step.waitForEvent(`ask-${q.id}`, {
  type: `answer-${q.id}`,
  timeout: "24 hours",
});

// ValueIQAgent.answerQuestion, after validating and storing the answer
await this.sendWorkflowEvent("RUN_WORKFLOW", runId, {
  type: `answer-${q.id}`,
  payload: answer,
});
```

### 7. Access and security

- Every agent connection, callable method, server function, and file read is access-checked first. Loaders and actions use `requireProjectAccess` (signed out redirects to `/sign-in`, other team gets 404, member and owner allowed). Roles are `owner | member` only, with the same project access (Q13, #99).
- The agent gate is `routeAgentRequest`'s `onBeforeConnect` (WebSocket) and `onBeforeRequest` (HTTP), both running the same check: reject any `route.className` other than `ValueIQAgent`, call `checkProjectAccess(request, route.name)`, return 401 for signed out and 404 for another team, and on success forward the request with `x-valueiq-user-id` set after deleting any client-sent copy. Same-origin WebSocket handshakes carry the Better Auth session cookie, so no URL token is needed. The automated access matrix covers the agent routes.
- A file id referenced from a form must belong to the same project.
- Secrets live only as Worker secrets; prompts and files are not logged beyond ids and hashes.
- Model output is untrusted: schema-validate, cap lengths, store only what matches the type.

### 8. Errors

`{ code, message, retryable }` with codes `ACCESS_DENIED, BAD_INPUT, FILE_UNREADABLE, MODEL_ERROR, MODEL_TIMEOUT, ENGINE_INTEGRITY, GATE_FAILED, QUESTION_TIMEOUT, CANCELLED`. A model failure retries with backoff, then offers retry or manual entry with progress saved. A failed gate is an outcome (`gap_list`), not an error.

### 9. Track responsibilities

| Track                                                         | Owner                        | Builds against                                         |
| ------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| Input form, upload UI                                         | Jonathan, Jeremiah           | `getProjectForm`, `saveProjectForm`, `FormFile`        |
| Identity, tables, storage, access, deploy, secrets, PDF store | Zihao                        | this plan, `interim-foundation.md`                     |
| Intake assistant, agent, workflow, loading page               | Eli                          | `ValueIQAgent`, run states, `Question`                 |
| Engine and tools                                              | Ryan, Eli                    | pure TypeScript, result type from the engine plan      |
| Results, report, PDF                                          | Ryan, with Zihao for storage | `getLatestResult`, `GapList`, never recomputes numbers |

## Execution phases

### Phase 0 - Align (to Thu Nov 5)

- Zihao reviewed #108 on Nov 5: both VERIFY items are resolved (see "Resolved before freezing"), and table, binding, and route names are set in sections 1 and 4-7.
- Merge freezes the shared rules; per-track plans then land as separate pull requests.
- Exit: this plan is merged.

### Phase 1 - Stub end to end (Fri Nov 6 to Sat Nov 7)

- Starts once `interim-foundation.md` Phases 1-3 (sign-in, projects, files) are on `develop`; if STOP 2 (Fri Nov 6) slips, this phase slips with it.
- `shared/types.ts`, the Phase 1 tables and server functions in sections 4 and 5, the `RUN_WORKFLOW` binding, the agent access gate, and a stub path: save form, `startRun`, fake steps, one `ask_user` question, `answerQuestion`, a stub result page labeled STUB. The pull request that adds `shared/types.ts` also lifts the "no domain types" rule in `AGENTS.md` and `docs/architecture.md`.
- Exit: on `valueiq-dev`, a signed-in team member runs the stub through one question to a stub result; signed out and other-team callers are refused on every agent route.

### Phase 2 - Replace stubs (Sun Nov 8 to Tue Nov 10)

- Swap stub steps for real parts as each track's plan lands: engine first, then Gemini-backed assistant and narrative, then confidence gate and gap-list screen, then files as evidence.
- Zihao adds `readProjectFileForModel`, `run_reports`, `saveReportPdf`, and `getReportPdf` before files as evidence and the report need them.
- Exit: one full real run on `valueiq-dev` without any stub label.

### Phase 3 - Check (Wed Nov 11 to Thu Nov 12)

- Access tests, failure tests (bad file, bad key, model error, bad input), bug fixes only. Then move surviving rationale to `.agents/decisions/`, update `docs/architecture.md`, and delete this plan.

## Research record (Team Agreement format)

- **Question:** what shape lets five people's work connect on Cloudflare with the least rework?
- **Context:** `docs/architecture.md` shows an empty `ValueIQAgent`, no tables, no shared types; `interim-foundation.md` covers identity, form storage, and files but not orchestration.
- **Sources reviewed:** Cloudflare Agents documentation: store and sync state, callable methods, run workflows (developers.cloudflare.com/agents/api-reference/); this repository's `AGENTS.md`, `docs/architecture.md`, `wrangler.jsonc`, `agents/valueiq-agent.ts`, `db/schema.ts`, and `interim-foundation.md`. For the VERIFY items (Zihao, Nov 5): the docs bundled with the installed Agents SDK 0.23.0 (`node_modules/agents/docs/routing.md`, `workflows.md`, `cross-domain-authentication.md`) and the `waitForApproval` source in `node_modules/agents/dist/workflows.js`.
- **Findings:** the SDK syncs agent state to connected clients over WebSocket; `@callable` exposes methods to clients and the docs say to treat arguments as untrusted; Workflows suit multi-step pipelines and human-in-the-loop waits, with durable steps and a progress callback to the agent; documented limits include 30 minutes per step, up to a year waiting for an event, and 10 MB per workflow state. `routeAgentRequest` takes `onBeforeConnect` and `onBeforeRequest` hooks that receive the instance name and can reject with a response before the Durable Object wakes; same-origin WebSocket handshakes carry cookies; `waitForApproval` wraps `step.waitForEvent` with a fixed `approval` event and throws on `approved: false`.
- **Decided (Nov 5):** team-held Gemini key as a Worker secret (Q3, #89); all storage on Cloudflare (Q4, #90); roles `owner | member` (Q13, #99); team-level financial defaults in `team_settings` (Q2, #88).
- **Assumptions:** one agent per project; one workflow run per calculation.
- **Risks:** a run that sits blocked on a question (bounded by the 24-hour timeout); Phase 1 depends on `interim-foundation.md` reaching STOP 2 on Fri Nov 6.
- **Recommended next step:** merge, then the stub run (Phase 1).

## Resolved before freezing (Zihao, 2026-11-05)

1. **Agent routing and the access hook.** `routeAgentRequest` with `onBeforeConnect` and `onBeforeRequest`, as section 7 specifies. Rejected: checking access only in the agent's `onConnect`, which wakes the project's Durable Object for every refused caller.
2. **Resuming a paused workflow with a free-form answer.** `step.waitForEvent` with a per-question event type, resumed by `sendWorkflowEvent`, as section 6 specifies. Rejected: `waitForApproval`, which waits on a fixed `approval` event, expects `{ approved, reason, metadata }`, and throws `WorkflowRejectedError` on `approved: false`, so it cannot carry `value`, `use_proxy`, or `exclude` and would end the run on anything but an approval.

## Validation boundaries

- On `valueiq-dev`: a signed-in member completes the stub run, answers the question, and reloads to see the stub result; the page and the stored row both say stub.
- The access matrix (signed out, other team, team member, owner) holds for the agent connection, the run and result routes, and file reads, checked by an automated script that the select-checks skill routes to.
- A late or duplicate answer (question not pending, or from another run) is rejected and does not resume the run.
- `pnpm db:generate` produces no diff after the committed migrations; `valueiq-select-checks` passes for the changed areas.
- No page or stored row presents a stub as a real assessment.
