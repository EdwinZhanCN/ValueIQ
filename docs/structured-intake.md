# Structured intake frontend

The local `/workspace` editor uses `shared/form.ts` and the real serializer/validator in `app/lib/intake-form.ts`. It exports Eli's form-file format; it does not perform calculations. This frontend follows the form-code work in #129 and extends the original I4 screen scope from #122.

## User flow

1. Start a blank draft or explicitly load Eli's labeled synthetic sample.
2. Choose currency, horizon and any combination of the four supported goals.
3. Enter financial settings and costs once. Cost lines require quoted / estimated / assumed basis. Adoption is a comma-separated list of percentages, one per horizon year.
4. Enter selected-goal values. Choose direct-hours or task-time inputs, error counts or rates, direct error cost or clean-unit derivation, and direct risk loss or asset/exposure inputs. Inactive paths/goals are excluded from export while their accepted answers and evidence stay in local state.
5. Choose plain-language source descriptions. Effect cards expose the structured file reference, quote and confirmation, low/high, corroborating figure, observations/coverage, date and owner verification. Nothing adds evidence checks automatically.
6. Optionally add notes and a measurement plan per selected goal.
7. Preview, copy or download validated JSON. Unknown is explicit null, never zero; essential costs and settings still block export if unknown. This is input validation, not calculation readiness or a confidence-release decision.

The sample starts from the independently validated reference in `docs/research/samples/sample-result.form.json`. With no edits, preview/copy/download bytes represent exactly the same JSON data, including record order, source metadata and measurement plan. User edits mark it as an edited sample; edited downloads use `project.form.json` instead of claiming to be the unmodified test fixture.

## State and provenance

- Invalid scalar/array edits are rejected on blur and retain the previous accepted value. Export also validates any uncommitted text, so clicking directly from an input cannot export a stale value. Incomplete cost-basis/evidence metadata does not discard an otherwise valid numeric entry; final validation reports the missing metadata.
- Defaults are offered as labeled proxies with sources. Clicking one explicitly accepts its value and provenance. Editing a default value changes its origin to user and its tier to estimate; it no longer claims to be the published default. Editing an evidenced value clears quote confirmation and reviewer verification; measured values are also downgraded to estimates.
- Value controls support fractional annual risk frequency and array adoption. Backing and measurement strings are preserved without calculation or schema translation.
- File groups project their required description onto each file ID in `file_descriptions`. Local selections are not uploaded and only retain reference/name metadata. Local IDs are not R2 identifiers and cannot be used as proof of server-side ownership. A future saved-project integration must use authorized infrastructure file rows/IDs and validate on the server.
- JSON previews clear on edits. `asked[]` records interacted-with field IDs without duplicates. No sample is silently saved as a real project. Refresh/leave clears this local draft.

## Validation

Browser checks exercise exact sample preview/copy/export bytes, fractional-count and adoption rejection, default provenance on manual edits, goal filtering and retained answers, a fresh form entered through controls, per-line cost basis, explicit unknowns, file descriptions, backing fields, reset, responsive overflow and clipboard fallback selection. The same form tests and regeneration checks still run in `pnpm check`; the smoke test checks the real workspace surface and export controls.

In this Windows test environment the browser download service cancels both the app download and an independent plain-text Blob download, in Chrome and Edge. The intended filename and generated Blob bytes were verified against Eli's reference; a complete browser-to-disk transfer could not be verified here. Clipboard handler output and the selectable read-only JSON fallback are tested separately. No browser policy or safety setting was changed to bypass this limitation.

The server project routes, persistence, authorization, assistant and engine remain unchanged. Project-page integration is a separate step; the visible local-only label is intentional.
