# Input form integration with Cloudflare

Status: active, 2026-11-06. Zihao reviewed it and recorded the decisions below. This document adds no implementation, migration, binding, or deployment. Baseline: `develop` at `8dacc7b`; open pull requests are dependencies, not delivered functionality.

Goal: a signed-in project member completes the structured intake form, saves an incomplete draft, uploads described evidence, reloads the project without losing accepted inputs, and submits a validated saved form to Eli's run flow on `valueiq-dev`. The engine receives the same canonical JSON produced by the input team's serializer.

## Sources and current reality

Read against Zihao's [infrastructure plan](../../../docs/research/plans/05-infra-db.md), [foundation plan](interim-foundation.md), [integration contract](integration-contract.md), [architecture](../../../docs/architecture.md), and [deployment guide](../../../docs/deployment.md). The input contract comes from the [field spec](../../../docs/research/plans/01a-input-structure.md) and [form-file format](../../../docs/research/samples/FORM-FILE-FORMAT.md).

| Area                                                                                                                                | Observed implementation                                                                                                                            | Consequence for this plan                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Project storage on `develop`                                                                                                        | Authenticated project page saves opaque JSON through `getProjectForm` / `saveProjectForm`; placeholder editor; 256 KiB UTF-8 save limit            | Replace the editor, preserve the access rule and existing stored drafts                        |
| Files on `develop`                                                                                                                  | Private `FILES` R2 bucket, D1 metadata, described uploads and authorized downloads; 10 MiB per file                                                | Reuse the Worker routes and returned file IDs                                                  |
| Input producer [#129](https://github.com/EdwinZhanCN/ValueIQ/pull/129)                                                              | Canonical `shared/form.ts`, serializer, validator and minimum fixtures                                                                             | Integration depends on the producer landing; do not define another form type                   |
| Frontend [#130](https://github.com/EdwinZhanCN/ValueIQ/pull/130)                                                                    | Structured editor and export on `/workspace`, browser-local state and synthetic file IDs                                                           | It does not yet persist a real project or upload evidence                                      |
| Wave-two fixtures [#132](https://github.com/EdwinZhanCN/ValueIQ/pull/132)                                                           | Nineteen additional producer-generated cases                                                                                                       | Preserve these alongside the minimum cases as integration regression inputs                    |
| Run infrastructure [#131](https://github.com/EdwinZhanCN/ValueIQ/pull/131), [#138](https://github.com/EdwinZhanCN/ValueIQ/pull/138) | Merged. Run tables, agent gate, `RUN_WORKFLOW`, and a real agent: `preflight`, `startRun`, `cancelRun`. `answerQuestion` is tabled (no `ask_user`) | The run flow exists; the input team hands it a saved form and does not build run orchestration |
| Engine [#137](https://github.com/EdwinZhanCN/ValueIQ/pull/137)                                                                      | Merged. `FormFile` is already defined in `engine/types.ts`                                                                                         | #129 reuses or replaces that type; there must be one definition                                |
| Run UI [#139](https://github.com/EdwinZhanCN/ValueIQ/pull/139)                                                                      | Deli's Run assessment section on the project page                                                                                                  | The input team does not build run controls                                                     |

`feature/64-cloudflare-run-integration` is superseded by #138; do not build on it.

## Non-goals

- Engine arithmetic, Gemini prompts, agent/workflow implementation, result calculations, PDF generation, or a new backend.
- New tables, bucket provisioning, authentication design, credentials, or changes to deployment configuration by the input team.
- Treating the local sample loader or synthetic evidence IDs as a real project or a real assessment.
- Production rollout in this documentation change.

## Fixed contracts

These are existing repository boundaries to preserve; proposed additions are listed separately below.

- Cloudflare Worker serves React Router; D1 stores project/form metadata; private R2 stores file bytes. Runtime data access stays in loaders/actions or `.server.ts` modules.
- Zihao owns identity, access, tables, storage, deployment and secrets. Jonathan/Jeremiah own form UI, input serialization, draft hydration and upload interactions. Eli owns assistant/run orchestration; engine/output owners own their result contracts.
- Every project loader/action/resource authorizes with `requireProjectAccess` before reads or writes. Existing server helpers do not authorize on the caller's behalf. Owner and member have project access; signed-out and other-team callers do not.
- The engine form uses `version: 1`, `goals`, `currency`, `horizon_years`, `inputs`, `file_descriptions`, `other_notes`, `measurement_plan`, and `asked`. Discount and adoption are input records. Preserve `null` unknowns, tiers, provenance, ranges and per-cost basis without coercion.
- `FormFile` remains defined in `shared/form.ts` from #129. A run-types module may re-export it, not create a second definition. Form `version` is the form-file format version inside the JSON. `runs.contract_version` is a separate value the run records about itself. Do not add a `contract_version` field to the form file.
- `source_file_id` must resolve to a persisted file belonging to this project. A description or browser-supplied project ID is not ownership proof. Measured evidence still requires the quoted passage and user confirmation.
- Existing deployment workflow: feature PR into `develop`, checks, then merge-triggered development deployment. Production uses a separate release PR into `main`. Contributors do not need Cloudflare credentials.

## Decisions (Zihao, 2026-11-06)

| Decision             | Answer                                                                                                                                                                                                         | Follow-up                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Incomplete drafts    | As proposed: drafts stay in `project_forms.form_json` with a versioned draft shape; no new columns. Lenient while filling, strict at Start run (like a GitHub draft PR).                                       | Eli: `startRun` calls #129's strict validator instead of the current shape check, once #129 merges |
| Validation API       | As proposed: draft validator/hydrator in the input layer; strict serializer/validator for export and Start run.                                                                                                | None                                                                                               |
| Simultaneous editors | Edit-conflict check, like Wikipedia: a save carries the `updatedAt` it loaded; a stale save is rejected, and the editor keeps local edits and offers reload/compare. No automatic merge, no real-time editing. | Zihao adds the conditional write to `saveProjectForm`                                              |
| Project goals        | The form is authoritative. The save action writes `projects.goals` from the form in the same batch.                                                                                                            | Zihao, with the conditional write                                                                  |
| Defaults             | Deferred. Use the engine's built-in defaults, labeled as proxies. No team settings API this round.                                                                                                             | Revisit after the demo                                                                             |
| Run input snapshot   | The form is copied onto the run row at Start run and the run reads only that copy, like a CI run pinned to a commit.                                                                                           | Done in [#142](https://github.com/EdwinZhanCN/ValueIQ/pull/142) (`runs.form_json`)                 |
| Evidence upload      | As proposed: upload first, bind the file ID only after the upload succeeds (like dragging an image into a GitHub issue).                                                                                       | None                                                                                               |

## Execution phases

### Phase 0 - Lock current failures and review contracts

Owners: input team, with Zihao and Eli reviewing their boundaries.

- Capture current gaps: refresh loses local editor state, file IDs are synthetic, the project editor is raw JSON, and strict export validation rejects incomplete drafts.
- Resolve the decisions above before adding persistence or run submission. Specify missing-row, legacy `{}`, supported draft, valid canonical form, malformed JSON and unsupported-version hydration behavior. Preserve recoverable old content; never silently replace it with an empty form.
- Agree server save responses for success, field errors, oversize input, stale revision and unexpected failure. These are proposed response requirements, not existing error codes. Retain typed field paths so the editor can focus the relevant control.
- Agree what draft data must survive: accepted input values, unknown selections, goals, notes, measurement plan, question history and persisted evidence links. Keep invalid in-progress text visible locally; decide explicitly whether it must also survive a reload. Browser `File` objects cannot be restored from JSON.
- Exit: decisions are recorded above (Zihao, 2026-11-06); Eli acknowledges the strict `startRun` check; input team records the draft schema and compatibility rules.

### Phase 1 - Save and reload a real project

Owner: input team; Zihao reviews the server boundary.

- After #129 and #130 land or are reconciled, mount the structured editor at `/projects/:projectId`, replacing the placeholder JSON editor. `/workspace` remains explicitly a local demonstration until separately changed.
- Loader authorizes first, then reads project, saved form and the authorized file list. Team-settings/default reads are deferred per the reviewed decision above. Server derives project identity from route/access results, never from submitted `FormContext`.
- Hydrate the agreed draft/canonical representation. Keep display-only state separate from the engine contract. Show unsupported/legacy content with a recovery path rather than asserting it is validated.
- Save through the existing project action and `saveProjectForm`, with the agreed validation and revision semantics. Retain the 256 KiB UTF-8 limit server-side. Do not mark an optimistic save as successful before acknowledgement.
- Preserve local edits on failed saves, revalidation and stale-save conflicts. Show saving/saved/failed state; protect navigation with unsaved changes. Use an explicit Save first; autosave is optional later.
- Keep project goals consistent using the Phase 0 decision. Use explicitly accepted, labeled built-in proxies; preserve saved values, source/tier and user overrides. Do not add a team-settings API or loader dependency this round.
- Exit: owner and member can save an incomplete draft, reload, sign out/in and recover it; rejected writes leave the last saved form intact. No run is started in this phase.

### Phase 2 - Attach real evidence

Owner: input team for UI; Zihao for storage/access behavior.

- Reuse POST `/projects/:projectId/files` (route module `app/routes/projects.files.ts`): multipart `file` and `description`; success is HTTP 201 with `{ ok: true, file }`. Current error values are `missing_file`, `missing_description`, and `too_large`.
- Upload each described file through the Worker. Only after success bind `file.id` to input backing and `file_descriptions`. Replace local placeholder references consistently; never submit `local-*` or sample `f1` as production evidence.
- Build the validator's trusted `{ projectId, files }` context on the server from `listProjectFiles(projectId)`. Its summaries omit `projectId`; associate each returned ID with the already-authorized project there, not from browser claims.
- Preserve successful uploads when another upload or subsequent form save fails. Offer retry for failed files without claiming a cross-D1/R2 transaction. Zihao's upload helper already removes an R2 object when its metadata insert fails.
- Use `/projects/:projectId/files/:fileId` for authorized downloads. Do not expose bucket keys. Honor 10 MiB per file; any separate count/type limits need Eli/Zihao agreement and visible UI wording.
- Revalidate evidence membership on save and run, including stale/missing references. Invalidate measured confirmation when the backing passage/source changes. Individual deletion/replacement endpoints and description editing are not provided by this plan; propose them to Zihao before adding controls that imply they exist.
- Exit: an actual upload survives reload and is referenced by the canonical export; a foreign/stale file ID is rejected without overwriting the accepted draft.

### Phase 3 - Canonical export and Eli's run handoff

Owners: input team for the saved form; Deli for run controls ([#139](https://github.com/EdwinZhanCN/ValueIQ/pull/139)); Eli for agent/workflow; Zihao for run persistence/access.

- Export with the real shared producer using persisted file IDs. Preserve exact field IDs and structured unknown values. Do not calculate ROI in the frontend.
- Before Start run: finish pending uploads and save acknowledged edits. The agent's `startRun` validates the saved form strictly on the server and pins a copy (#142); a disabled button is not enforcement.
- The input team does not build run controls, create run rows from the browser, or duplicate the workflow. #139 owns the Start run button and progress view.
- Preserve the draft on disconnection/failure. Edits after Start run reach the next run, not the running one.
- Questions (`ask_user` / `answerQuestion`) are tabled; do not build a question UI.
- Exit: an incomplete draft is refused by Start run with its missing fields; a complete saved form runs through #139 to a real result, with reload recovery and access checks.

### Phase 4 - Development rollout and handoff

Owner: Zihao for deployment; input team for acceptance evidence.

- Ship small implementation PRs into `develop`: draft persistence, evidence linkage, then the saved-form handoff to the existing run UI. Each states dependencies and remaining limitations. No direct push to protected branches.
- Zihao confirms required bindings/migrations/secrets and uses the existing GitHub Actions release path. This plan requires no credentials, migration application or remote deployment now.
- On `valueiq-dev`, test save/upload/reload as member and owner and refusal as outsider/signed out. Include two browser sessions for conflict behavior. Collect IDs/statuses and reproducible steps without logging file contents or secrets.
- On regression, preserve stored data and coordinate code rollback/forward fix with Zihao; do not roll back D1 by editing an applied migration. Review any incompatible draft-schema change before release.
- Exit: record development acceptance evidence and remaining debt; update architecture to match shipped behavior. Extract lasting decisions and delete this active plan when all phases finish.

## Validation boundaries

This PR is documentation only: run `pnpm format:check`, verify relative links and named package scripts. Runtime checks below are implementation acceptance criteria, not claims of tests already run.

- Form regression: `pnpm fixtures:forms` and `pnpm test:forms` after the relevant fixture PRs land. Minimum and wave-two exports must remain semantically identical to their references; invalid cases remain rejected. Add persistence round-trip cases covering nulls, arrays, ranges, provenance, cost flags, measurement plans and `asked`.
- Draft behavior: empty/incomplete saves work, malformed/unsupported payloads receive the agreed handling, legacy content is recoverable, invalid edits preserve accepted values, failed/stale saves retain local work, and an older tab cannot silently overwrite newer data under the selected policy.
- File boundary: described upload/download round trip, size rejection, partial-upload retry, failed form save after upload, forged project/file IDs, changed evidence confirmation, and unavailable R2 objects. UI must distinguish a metadata link from readable evidence.
- Access boundary: `pnpm test:access` covers loader, save, upload/download and every new project/run route. Test signed out, other team, member and owner; agent cases also cover membership removal after connection and forged identity headers with Eli/Zihao.
- Runtime changes: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:smoke`, and browser verification for changed UI, plus `pnpm format:check`, following [valueiq-select-checks](../../skills/valueiq-select-checks/SKILL.md). `pnpm check` bundles static/form/build/dry-run checks where those scripts have landed; smoke/access remain separate.
- If Zihao changes schema/config: use the skill's migration and deployment rows, including local migration application and `pnpm deploy:check`. A dry run packages code; it does not prove remote behavior.
- Handoff boundary: engine consumes producer-generated canonical saved bytes; run hash/version metadata matches the immutable snapshot; subsequent edits cannot mutate a running or historical assessment. Failed submission creates no misleading success state. Stub and real results stay visibly distinguishable.

## Review checklist for Zihao

- [x] Confirm existing APIs/routes/limits are represented correctly and identify required server API additions (conditional `saveProjectForm`, goals in the same batch).
- [x] Approve draft representation and legacy handling with the input team.
- [x] Resolve revision enforcement, goals consistency and sourced-default versioning (defaults deferred).
- [x] Agree immutable run-input persistence and save/start ordering with Eli (#142).
- [x] Reconcile the two run infrastructure branches and shared form/run version wording.
- [ ] Confirm the staged PR order and development acceptance ownership.

Review acknowledgement: Zihao, 2026-11-06. Eli still to acknowledge the strict `startRun` check and #142.
