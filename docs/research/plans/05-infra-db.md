# Plan 05: Infrastructure and database (Zihao)

Read `README.md` first. Issues: #57 Z1, #58 Z2 (Ag6), #59 Z3, #60 Z4 (Ag3), #61 Z5, #62 Z6, #63 Z7, #64 Z8, #88 Q2, #89 Q3, #90 Q4, #108 (review of the integration contract, PR #109). Your own plan is `interim-foundation.md` in the repo; this file lists what the other tracks now need from it.

## Summary of what changed for you

The research added requirements beyond sign-in, projects, forms, and files. The details are in PR #109 (integration contract); here is the short list, in priority order.

1. **Agent per project, behind your access guard.** `ValueIQAgent` Durable Object keyed by project id. Every connection, callable, server function, and file read must pass `requireProjectAccess` (signed out redirects to sign-in; other team gets 404; member and owner allowed). Please add the agent routes to your automated access matrix. VERIFY: the Agents routing and the hook that runs your guard before a connection is accepted.
2. **Calculation run as a Cloudflare Workflow** (`AgentWorkflow`), started by the agent, with a workflow binding in `wrangler.jsonc` for both `development` and `production`, and the class exported from `workers/app.ts`. It can pause for a user answer. VERIFY: whether `waitForApproval` with `sendWorkflowEvent` or `step.waitForEvent` fits a free-form answer. Limits read in the docs: 30 minutes per step, up to 1 year waiting on an event, 10 MB workflow state.
3. **New tables (names yours to decide):** `runs`, `run_events` (append-only audit), `run_questions`, `results` (exactly one of result JSON or gap-list JSON), `report_pdfs`. Plus the form file stays opaque in `project_forms`.
4. **Files must be linkable to inputs.** Inputs carry `source_file_id`; the engine must reject ids from another project. Add a server function that gives the model a file's bytes or text with mime, project-scoped and size-limited: `readProjectFileForModel(fileId)`.
5. **Secrets:** `GEMINI_API_KEY` as a Worker secret (Q3 recommendation: team-held key, no key screen). Never log prompts containing keys; log ids and hashes, not file contents.
6. **Versioning:** store `contract_version`, `formula_version`, `settings_version` and `mode` (real or stub) on each run and result. Historical reports keep their original settings.
7. **Team goals and defaults (Q2/Z4):** defaults are sourced values shown as labeled proxies, not silent. Starting set to host: discount rate 10%, horizon 3, recapture 50%, cost-uplift tiers 15 / 30 / 50%. These can live in `team_goals` with a rationale, source, author, and effective date per setting (Sprint 4 org-config policy). Everything else is team judgment; do not treat them as facts.
8. **PDF store (Z6):** `saveReportPdf`, `getReportPdf`, R2 keys per team and project, same access rule. Charts are generated with Ryan's approach (O2).
9. **Stub run first.** Target: a labeled stub end-to-end run on `valueiq-dev` by Sat Nov 7 (save form, start run, fake steps, one question, answer, stub result page). Then swap in real parts Nov 8-10.

## Why the system needs these (research)

- Run durability and human pauses: Cloudflare Agents/Workflows docs (read): agent state syncs to clients over WebSocket; Workflows suit multi-step pipelines with retries and waits; `@callable` arguments are untrusted input.
- Audit and versioning: Sprint 4 section 3.7 (every stage, evidence label, formula and settings version is logged; recalculation creates a new version; manual overrides keep the computed value, reason, author, time).
- Anti-gaming: a tier upgrade to `measured` requires an attached file in the same project and a user-confirmed quoted passage, so file ownership checks are a correctness requirement, not just security.
- Evidence-based confidence: the engine needs file ids, period, and sample metadata per input (Forrester TEI and the UK Green Book both treat evidence quality as an input to the number).

## Access matrix to test

| Actor       | Project page      | Agent connect | Form save | File download | Result  |
| ----------- | ----------------- | ------------- | --------- | ------------- | ------- |
| signed out  | redirect /sign-in | refused       | refused   | refused       | refused |
| other team  | 404               | refused       | 404       | 404           | 404     |
| team member | allowed           | allowed       | allowed   | allowed       | allowed |
| owner       | allowed           | allowed       | allowed   | allowed       | allowed |

## Collaboration

- Input team: field list for tables (Ag6), file-to-input link.
- Eli: agent methods (`chat`, `preflight`, `startRun`, `answerQuestion`, `cancelRun`), run states, error codes.
- Ryan: result retrieval and PDF storage.

## Open questions (yours to answer)

Q2 (what a team goal holds), Q3 (keys), Q4 (Cloudflare for all storage), Q13 (roles), the two VERIFY items, table naming for the additions, and how the contract fits `interim-foundation.md` Phase 0 now that its freeze date has passed.
