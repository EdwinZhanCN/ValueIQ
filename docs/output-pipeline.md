# Persisted output pipeline

The pushed deterministic engine is included from `feature/84-engine-core` at `e452431`. Engine/assistant unit tests and real computed-output consumer checks run locally. PR #138 now supplies the Worker agent/workflow and D1 store; the output UI still needs its Start Run control. The output pipeline can read validated engine snapshots, preserve saved intake, and generate private PDFs in Cloudflare R2. No route calculates or fabricates an assessment. `/workspace` remains an explicitly labeled STUB preview.

## Server handoff

Every project loader/action/resource first calls `requireProjectAccess(request, projectId)`. It returns the server-owned `ProjectAccess` capability; signed-out requests redirect to sign-in, and missing or other-team projects return 404. Owner and member have equal project access. Internal server functions below accept that capability, never a browser-provided user or team id.

| Function                                                                                                            | Purpose                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createRun({projectId, startedBy, mode, formHash, contractVersion, formulaVersion, settingsVersion, id?, status?})` | Canonical internal run API; caller authorizes first. Returns the run row.                                                                                                   |
| `finishRun(runId, {status: "released", result: output})` or `{status: "gap_list", gapList: output}`                 | Validates the complete version 1 envelope and atomically publishes once; returns false for a terminal run. Failed/cancelled outcomes use the canonical status-only variant. |
| `getRun(access, runId)` in `output-runs.server.ts`                                                                  | Project-scoped consumer snapshot `{run, output}` or null. Pending and failed runs have null output. Corrupt terminal output fails visibly.                                  |
| `getLatestResult(access)` in `output-runs.server.ts`                                                                | Selects the latest started run, including pending/failed/gap outcomes, so a pending run never falls back to an old headline.                                                |
| `listRunReports(access, runId)`                                                                                     | Lists saved PDFs for the selected project and run.                                                                                                                          |
| `saveReportPdf(access, runId)`                                                                                      | Reads the pinned result from D1, renders on the Worker, saves bytes in private R2 and metadata in D1; returns report id. Gap/pending outcomes return 409.                   |
| `getReportPdf(access, runId, reportId)`                                                                             | Streams the private object after project/run/report identity matches.                                                                                                       |

Publication functions in `app/server/runs.server.ts` retain the merged infrastructure API. Consumer reads in `app/server/output-runs.server.ts` add project scoping, envelope validation and latest-pending behavior without changing infrastructure's raw run getters. Report functions live in `app/server/reports.server.ts`. There is no HTTP endpoint accepting result JSON. The engine owner can publish a complete `computeProject` envelope from trusted orchestration after establishing access; the calculation library itself stays free of I/O. The merged live agent/workflow implementation and D1 store are preserved. They publish complete envelopes through the same canonical functions. UI launch wiring and live model validation are separate follow-up work.

`shared/output.ts` validates and infers the supplied PR #123 version 1 contract, including additive label/year fields. Engine-owner alignment remains required before freeze. It checks structure and declared release conditions, not engine arithmetic. Unknown additive keys are ignored. ROI is already in percentage points; confidence is a ratio. Currency uses two decimals and percentages one decimal. A stored stub always displays STUB in the page and PDF.

## Pages and persistence

- `/projects` and `/projects/new`: authenticated team project listing/creation.
- `/projects/:projectId` and `/clarify`: the Intake and Clarify steps that save the project form ([structured intake](structured-intake.md)).
- `/projects/:projectId/results`: latest run; `?run=...` pins a historical snapshot. Pending runs refresh from server status. Results and gap links preserve run identity and target input when returning to intake. The JSON editor focuses the requested key when present; it cannot supply structured-field navigation yet.
- POST `/projects/:projectId/runs/:runId/reports`: same-origin, access-checked generation using only the stored run. Redirects to the report tab with a download link.
- GET `/projects/:projectId/runs/:runId/reports/:reportId`: authenticated PDF attachment, private/no-store response.

Saving intake preserves answers and leaves older results and PDF bytes unchanged. Saving does not start a calculation. The backend Start Run RPC exists; connecting a user-facing control to it is still pending. Existing PDFs are immutable artifacts. Report generation currently uses a fixed template with graphs and tables; selectable chart/section choices remain separate unfinished work.

The merged `0001_runs.sql` and its event/question tables remain unchanged. The generated additive `0002_smart_korvac.sql` adds only `run_reports`. Each terminal result row contains one complete envelope in `result_json` or `gap_list_json`. The obsolete local draft migration was removed before publication; its local test state is backed up under `/tmp/valueiq-draft-output-state-*`.

The `FILES` binding matches PR #124 head `864df74fcfc7ce5870b83a0f793eddb46c334e77`: local `valueiq-files`, development `valueiq-dev-files`, production `valueiq-prod-files`. Objects use `teams/{teamId}/projects/{projectId}/reports/{runId}/{reportId}.pdf`. A failed D1 metadata insert removes the uploaded object. Release uses the repository’s protected-branch checks and GitHub Actions; pushing a release to main triggers production deployment, including additive migrations.

## Local verification

Run on Node 24 with dependencies installed and `.dev.vars` configured as in the repository README:

```sh
pnpm test:engine
pnpm test:output
pnpm test:access
pnpm test:output:runtime
# Stop other local Workers sharing .wrangler/state before this test.
pnpm test:smoke
# With pnpm dev --host 127.0.0.1 --port 5187 running separately:
VALUEIQ_TEST_ORIGIN=http://127.0.0.1:5187 pnpm test:output:integration
```

Contract tests cover malformed outputs, null versus zero, gate declarations and unchanged supplied numbers. The isolated workerd publisher test exercises real server functions with a temporary D1 database. The integration harness refuses non-local origins, creates throwaway users/teams/projects and seeds STUB snapshots into local D1 only. It checks owner/member/outsider/signed-out access, saved forms, private R2 generation/download, gap suppression, stale-run pinning, invalid data and unchanged historical PDFs. Test artifacts and local cookies stay under the system temporary directory.

These checks prove the storage/consumer boundary. The separate engine suite checks financial formulas, golden fixtures and generated reconciliation cases. Local checks do not prove live model calls, evidence ingestion, structured intake behavior or remote Cloudflare configuration.

Observed locally on 2026-11-05: `pnpm check`, all eight deployment-target tests, `pnpm test:smoke`, `pnpm test:output:integration`, frozen-lockfile installation and peer checks passed. Regenerating migrations reported no schema changes. A representative previous-schema database upgraded without losing its records. Development and production builds, target validation and deployment dry runs passed with distinct D1/R2 targets. Chrome checks passed for saved-intake edit/reload/return, gap targets, PDF generation/download, and mobile rendering without browser errors. After restarting the local Worker, saved answers and the pinned result remained available and an existing R2 PDF retained its exact bytes. No real engine or remote deployment was tested.

Release-candidate verification on 2026-11-06: the full check bundle passed with 181 engine/assistant tests and seven engine-to-consumer checks (one optional Python-oracle test skipped because this host has `python3` rather than `python`). All nine deployment-target tests passed. The canonical access matrix passed for seven targets and four actors, including result reads and report generation/download. Saved-intake/R2 runtime and smoke checks passed against canonical migrations. An actual computed real-mode result rendered an 11-page PDF that reopened successfully. No live model call was made.

Development reconciliation on 2026-11-06 preserves PR #138 live agent/workflow code. All 200 engine/assistant/server tests pass (one optional Python oracle remains skipped locally), including the orchestrator-to-output snapshot read. Local access, R2 runtime and smoke checks pass. Missing model keys now produce an immediate recorded MODEL_ERROR with a terminal failed run instead of retrying configuration. No secret was created or changed, and no live model call was made.
