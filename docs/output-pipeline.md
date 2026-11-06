# Persisted output pipeline

The executable engine has not been pushed. The output pipeline can read validated engine snapshots, preserve saved intake, and generate private PDFs in Cloudflare R2. No route calculates or fabricates an assessment. `/workspace` remains an explicitly labeled STUB preview.

## Server handoff

Every project loader/action/resource first calls `requireProjectAccess(request, projectId)`. It returns the server-owned `ProjectAccess` capability; signed-out requests redirect to sign-in, and missing or other-team projects return 404. Owner and member have equal project access. Internal server functions below accept that capability, never a browser-provided user or team id.

| Function                                                                                       | Purpose                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createRun(access, { mode, formHash, contractVersion, formulaVersion, settingsVersion, id? })` | Trusted engine/workflow code creates a running row; returns its id.                                                                                                                        |
| `finishRun(access, runId, output)`                                                             | Validates a version 1 envelope and atomically publishes one immutable result or gap list. Rejects terminal runs, mismatched metadata, invalid release declarations and oversized payloads. |
| `getRun(access, runId)`                                                                        | Returns `{ run, output }` or null. Pending and failed runs have null output. Corrupt terminal output fails visibly.                                                                        |
| `getLatestResult(access)`                                                                      | Selects the latest started run, including pending, failed and gap outcomes; never substitutes an older headline.                                                                           |
| `listRunReports(access, runId)`                                                                | Lists saved PDFs for the selected project and run.                                                                                                                                         |
| `saveReportPdf(access, runId)`                                                                 | Reads the pinned result from D1, renders on the Worker, saves bytes in private R2 and metadata in D1; returns report id. Gap/pending outcomes return 409.                                  |
| `getReportPdf(access, runId, reportId)`                                                        | Streams the private object only after project/run/report identity matches.                                                                                                                 |

Run functions live in `app/server/runs.server.ts`; report functions in `app/server/reports.server.ts`. There is no HTTP endpoint for submitting result JSON. The engine owner should import the server publication functions from trusted orchestration code after establishing project access; the deterministic calculation library itself stays free of I/O. Agent, workflow, event and question handling remain pending their owners' slices.

`shared/output.ts` validates and infers the supplied PR #123 version 1 contract, including additive label/year fields. Engine-owner alignment remains required before freeze. It checks structure and declared release conditions, not engine arithmetic. Unknown additive keys are ignored. ROI is already in percentage points; confidence is a ratio. Currency uses two decimals and percentages one decimal. A stored stub always displays STUB in the page and PDF.

## Pages and persistence

- `/projects` and `/projects/new`: authenticated team project listing/creation.
- `/projects/:projectId`: opaque saved JSON form editor, until the structured intake slice lands. The project service is copied from PR #125 head `5a041ee79705891183e04829197afaf8334740a2`; reconcile with that owner before merge.
- `/projects/:projectId/results`: latest run; `?run=...` pins a historical snapshot. Pending runs refresh from server status. Results and gap links preserve run identity and target input when returning to intake. The JSON editor focuses the requested key when present; it cannot supply structured-field navigation yet.
- POST `/projects/:projectId/runs/:runId/reports`: same-origin, access-checked generation using only the stored run. Redirects to the report tab with a download link.
- GET `/projects/:projectId/runs/:runId/reports/:reportId`: authenticated PDF attachment, private/no-store response.

Saving intake preserves answers and leaves older results and PDF bytes unchanged. Starting a new calculation from those edits waits for the executable engine and orchestration; the page says so. Existing PDFs are immutable artifacts. Report generation currently uses a fixed template with graphs and tables; selectable chart/section choices remain separate unfinished work.

The generated migration `0001_equal_riptide.sql` proposes only `runs`, `run_results` and `run_reports` from the integration plan. Each result row contains exactly one complete envelope in `result_json` or `gap_list_json`. No agent state, workflow binding, event or question table was added.

The `FILES` binding matches PR #124 head `864df74fcfc7ce5870b83a0f793eddb46c334e77`: local `valueiq-files`, development `valueiq-dev-files`, production `valueiq-prod-files`. Objects use `teams/{teamId}/projects/{projectId}/reports/{runId}/{reportId}.pdf`. A failed D1 metadata insert removes the uploaded object. Infrastructure-owner review and remote bucket provisioning remain deployment prerequisites. No remote migration, bucket creation or deployment was performed.

## Local verification

Run on Node 24 with dependencies installed and `.dev.vars` configured as in the repository README:

```sh
pnpm test:output
# Stop other local Workers sharing .wrangler/state before this test.
pnpm test:smoke
# With pnpm dev --host 127.0.0.1 --port 5187 running separately:
VALUEIQ_TEST_ORIGIN=http://127.0.0.1:5187 pnpm test:output:integration
```

Contract tests cover malformed outputs, null versus zero, gate declarations and unchanged supplied numbers. The isolated workerd publisher test exercises real server functions with a temporary D1 database. The integration harness refuses non-local origins, creates throwaway users/teams/projects and seeds STUB snapshots into local D1 only. It checks owner/member/outsider/signed-out access, saved forms, private R2 generation/download, gap suppression, stale-run pinning, invalid data and unchanged historical PDFs. Test artifacts and local cookies stay under the system temporary directory.

These checks prove the storage/consumer boundary. They do not prove executable-engine math, real evidence ingestion, structured intake behavior or remote Cloudflare configuration.

Observed locally on 2026-11-05: `pnpm check`, all eight deployment-target tests, `pnpm test:smoke`, `pnpm test:output:integration`, frozen-lockfile installation and peer checks passed. Regenerating migrations reported no schema changes. A representative previous-schema database upgraded without losing its records. Development and production builds, target validation and deployment dry runs passed with distinct D1/R2 targets. Chrome checks passed for saved-intake edit/reload/return, gap targets, PDF generation/download, and mobile rendering without browser errors. After restarting the local Worker, saved answers and the pinned result remained available and an existing R2 PDF retained its exact bytes. No real engine or remote deployment was tested.
