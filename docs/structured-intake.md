# Structured intake

The project form (`shared/form.ts`, FormFile v1) is filled in over two steps of the project flow ([Mock UI](mock-ui/README.md) 03 and 04). Both steps edit the same saved form and never calculate anything.

| Step    | Route                          | Edits                                                                                                                                    | Code                      |
| ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Intake  | `/projects/:projectId`         | project name, decision statement, goals (time savings, data quality, decision speed, risk reduction; several allowed), file descriptions | `app/components/intake/`  |
| Clarify | `/projects/:projectId/clarify` | currency, horizon, settings, costs and every goal's inputs, with evidence                                                                | `app/components/clarify/` |

## Saving

- Both steps POST the whole form to `/projects/:projectId/form` (`app/server/form-save.server.ts`) with `baseUpdatedAt`. A save over someone else's newer version answers 409 and keeps local edits.
- Each step changes only its own fields and writes the rest back unchanged (`applyIntake` in `intake-draft.ts`, `useFormDraft` in `clarify/use-form-draft.ts`).
- Drafts are read leniently with `readFormDraft` and may be incomplete. `validateFormFile` decides readiness: Clarify enables "Continue to Process" only on a valid form, and `startRun` refuses anything else on the server (#147). Essential costs and settings are required; benefit inputs may stay empty, which the engine reports as a gap list.
- The server checks every versioned save against the project's uploaded file ids (`validateIntakeDraft` in `app/lib/intake-draft.ts`). Missing essential costs and settings may be saved. An out-of-range value, an adoption list that does not match the horizon, or a file id from outside the project answers 400 and keeps local edits. A complete form is stored through the canonical serializer; payloads without `version` (scripts) are stored as they are.

## Intake

- Files use the project upload route; their ids in `file_descriptions` are real upload ids. A batch of uploads shares one description. The project description file (pdf, md or docx) is the upload described as `Project description`; the contract has no file-role field.
- `?input=<id>` focuses an Intake field, or redirects to the Clarify card that owns the id.

## Clarify

- The first card offers the labeled industry defaults and proxies for the chosen goals. Then one card per input group, in form order, beside a panel of what is entered so far and what still blocks Process.
- Each field offers its value and unit, "Not sure" (unknown is explicit null, never zero), a labeled proxy where the catalog has one, the cost basis for costs, and the source file, quote and other evidence. Editing a default makes it a user estimate; editing evidenced values clears the quote confirmation.
- Questions come from the field catalog (`app/lib/intake-catalog.ts`), not from a model. The assistant does not ask or prefill anything yet.

## Form types

`shared/form.ts` owns the wire schema. The engine re-exports that `FormFile`, with a compile-time equality check. Older engine and assistant callers use `LegacyFormFile`, derived from it. Both validators skip the before/after ordering check when either input is marked unknown.

## Checks

`pnpm test:forms` covers the serializer and validator. `pnpm test:smoke` covers the Intake and Clarify pages, and `pnpm test:access` covers the save route and the run-start refusal.
