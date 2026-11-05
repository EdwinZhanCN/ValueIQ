# Integration contract: how the pieces connect

Status: active - 2026-11-04, **proposed, nothing frozen**. Frozen only when Zihao approves the pull request for #108. This plan fixes the shared ground rules for connecting the input form, intake assistant, calculation run, `ask_user`, and results/PDF. It adds no code, tables, or bindings: the shells in `AGENTS.md` stay empty until each owner's slice lands. Author: Eli. Reviewer and owner of infrastructure: Zihao. Tracked in #108 (review), #64 (Z8), #72 (A1).

Goal: a person on `valueiq-dev` saves a form, talks to the intake assistant, starts a calculation run that can stop to ask one question, and opens a result page, with every step running on Cloudflare and every track building to the same interfaces. First observable milestone: a labeled stub run end to end by Sat Nov 7 (Phase 1), so Nov 8-10 only swaps stubs for real parts.

## Non-goals

- The per-track plans (input form and defaults, intake assistant prompts, calculation tools and engine formulas, output/report design) and the research behind them. They follow in separate pull requests and may refine, never silently contradict, this plan.
- Final table names, column types, route names, and binding names. Zihao decides them; the ones below are proposals.
- Identity, teams, and file storage design: owned by [`interim-foundation.md`](interim-foundation.md). This plan only states what it additionally needs from it.
- Any real numbers. Until the engine plan lands, every run is a stub and must say so.

## Rules for every agent and human

1. Build native to the repo: Workers, D1 through Drizzle, R2, Durable Objects through the Agents SDK, Cloudflare Workflows. No separate server, database, or queue outside Cloudflare. Model calls go from the Worker to Gemini with `GEMINI_API_KEY` as a Worker secret (Q3 recommendation).
2. Follow `AGENTS.md`: server-only code in `.server.ts` modules or loaders and actions, generated files stay generated (`pnpm typegen`), migrations come from `db/schema.ts` via `pnpm db:generate` and a merged migration is never edited, no secrets in git.
3. Zihao owns identity, access, tables, storage, deploy, and secrets. Others propose changes to those in a pull request against this plan or in #108; they do not create tables, buckets, or auth code on their own.
4. Never present mock or scripted output as a real assessment. A stub run carries `mode: "stub"` in its data and a visible STUB label in the UI.
5. Code computes; models collect, route, and explain. A model never produces or changes a number that is displayed as a result.
6. A change to a shared type, method name, table, or event needs a pull request to this plan and an acknowledgement from each affected owner.

## Fixed contracts (proposed; freeze at approval)

### 1. Runtime shape

- One `ValueIQAgent` Durable Object per project; the instance name is the project id. Browsers connect with the Agents SDK `useAgent`.
- Agent state synced to clients holds only a small run view (type below). Heavy data stays out of agent state: form in D1 `project_forms`, files in R2 through `files`, runs and results in D1.
- The calculation run is a Cloudflare Workflow (`AgentWorkflow`) started with the agent's `runWorkflow`, because it is a multi-step pipeline that may pause for a person. Steps are durable and retried; progress reaches the agent through `reportProgress` and durable state updates.
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

### 4. Tables (Zihao implements; names and columns are proposals)

Already planned: `projects`, `project_forms`, `files`, `team_goals`. Proposed additions:

| Table           | Columns                                                                                        | Purpose                                    |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `runs`          | id, project_id, status, form_hash, mode, contract_version, started_by, started_at, finished_at | one row per run                            |
| `run_events`    | run_id, seq, step, type, payload_json, created_at                                              | append-only audit log                      |
| `run_questions` | id, run_id, payload_json, answer_json, answered_by, asked_at, answered_at                      | `ask_user` history                         |
| `results`       | run_id (PK), released, result_json, gap_list_json, created_at                                  | exactly one of the two JSON columns is set |
| `report_pdfs`   | id, run_id, r2_key, created_by, created_at                                                     | report storage                             |

Every row is reached only through server functions that call `requireProjectAccess`.

### 5. Server functions

Existing in [`interim-foundation.md`](interim-foundation.md): `getProjectForm`, `saveProjectForm`, `listProjectFiles`, `readProjectFile`, `requireProjectAccess`. Proposed additions: `createRun`, `appendRunEvent`, `finishRun`, `getRun`, `getLatestResult`, `readProjectFileForModel(fileId)` (bytes or text plus mime for Gemini, project-scoped, size-limited), `saveReportPdf`, `getReportPdf`. Callers never receive a raw D1 or R2 handle outside these modules.

### 6. Agent methods

Browser-callable: `chat(message)` (streaming), `preflight()`, `startRun()`, `answerQuestion(questionId, answer)`, `cancelRun()`. Workflow callbacks (`onWorkflowProgress`, `onWorkflowComplete`, `onWorkflowError`) update the run view and write `run_events`.

### 7. Access and security

- Every agent connection, callable method, server function, and file read checks `requireProjectAccess` first (signed out redirects to `/sign-in`, other team gets 404, member and owner allowed). The automated access matrix covers the agent routes.
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

- Zihao reviews #108, edits this plan where it conflicts with his architecture, answers the two VERIFY items below, and approves.
- Merge freezes the shared rules; per-track plans then land as separate pull requests.
- Exit: this plan is merged and the VERIFY items are resolved or explicitly deferred with a default.

### Phase 1 - Stub end to end (Fri Nov 6 to Sat Nov 7)

- `shared/types.ts`, the tables and server functions in sections 4 and 5, the Workflow binding, and a stub path: save form, `startRun`, fake steps, one `ask_user` question, `answerQuestion`, a stub result page labeled STUB.
- Exit: on `valueiq-dev`, a signed-in team member runs the stub through one question to a stub result; signed out and other-team callers are refused on every agent route.

### Phase 2 - Replace stubs (Sun Nov 8 to Tue Nov 10)

- Swap stub steps for real parts as each track's plan lands: engine first, then Gemini-backed assistant and narrative, then confidence gate and gap-list screen, then files as evidence.
- Exit: one full real run on `valueiq-dev` without any stub label.

### Phase 3 - Check (Wed Nov 11 to Thu Nov 12)

- Access tests, failure tests (bad file, bad key, model error, bad input), bug fixes only. Then move surviving rationale to `.agents/decisions/`, update `docs/architecture.md`, and delete this plan.

## Research record (Team Agreement format)

- **Question:** what shape lets five people's work connect on Cloudflare with the least rework?
- **Context:** `docs/architecture.md` shows an empty `ValueIQAgent`, no tables, no shared types; `interim-foundation.md` covers identity, form storage, and files but not orchestration.
- **Sources reviewed:** Cloudflare Agents documentation: store and sync state, callable methods, run workflows (developers.cloudflare.com/agents/api-reference/); this repository's `AGENTS.md`, `docs/architecture.md`, `wrangler.jsonc`, `agents/valueiq-agent.ts`, `db/schema.ts`, and `interim-foundation.md`.
- **Findings:** the SDK syncs agent state to connected clients over WebSocket; `@callable` exposes methods to clients and the docs say to treat arguments as untrusted; Workflows suit multi-step pipelines and human-in-the-loop waits, with durable steps and a progress callback to the agent; documented limits include 30 minutes per step, up to a year waiting for an event, and 10 MB per workflow state.
- **Assumptions:** Gemini key as a Worker secret (Q3); one agent per project; one workflow run per calculation.
- **Risks:** the routing and auth hook for agent connections and the free-form-answer pause API were not in the pages read (VERIFY below); a run that sits blocked on a question for long periods; Zihao's Phase 0 freeze date (Nov 4 noon) has passed, so this plan arrives as an addition.
- **Recommended next step:** Zihao reviews in #108; then the stub run (Phase 1).

## VERIFY before freezing

1. Agents routing and the hook that runs `requireProjectAccess` before a connection is accepted.
2. Whether a free-form answer resumes a paused workflow through `waitForApproval` with `sendWorkflowEvent`, or needs `step.waitForEvent`.

## Validation boundaries

- On `valueiq-dev`: a signed-in member completes the stub run, answers the question, and reloads to see the stub result; the page and the stored row both say stub.
- The access matrix (signed out, other team, team member, owner) holds for the agent connection, the run and result routes, and file reads, checked by an automated script that the select-checks skill routes to.
- `pnpm db:generate` produces no diff after the committed migrations; `valueiq-select-checks` passes for the changed areas.
- No page or stored row presents a stub as a real assessment.
