# Structured intake frontend

The structured form mounts at `/projects/:projectId`, using the project action and `saveProjectForm`. Ready saves use `shared/form.ts` and the real serializer/validator in `app/lib/intake-form.ts`. Eli's existing Run assessment section reads that saved form. No frontend arithmetic or new infrastructure is introduced.

The local sample/export preview remains at `/workspace?view=intake`; `/workspace` keeps the output preview. Open a project to save answers and upload evidence. Synthetic samples and local file IDs are available only in the local preview.

## Saving and evidence

- The authorized loader hydrates saved canonical forms and supported incomplete drafts. Legacy `{}` initializes an empty editor; unsupported content remains available in the recovery JSON editor without silent replacement.
- Save intake sends the loaded revision to Zihao's conditional `saveProjectForm`. Conflicts and failures preserve local edits; successful saves advance the editor's revision. Changes made while a save is pending remain unsaved. Navigation protection warns before discarding edits, and unsaved edits disable Start run.
- Drafts keep the version-1 envelope and add `intake_draft_version: 1`. Empty goals and horizon 0 mean unanswered. Missing essential settings/costs and unfinished measured confirmation can be saved, while malformed values, ranges and foreign file references remain invalid. Drafts cannot start a run. Strict export-ready saves omit the draft marker and use canonical producer JSON unchanged.
- Real project files come from the authorized server listing. The existing described upload UI writes through the Worker; successful upload revalidation makes the persisted ID selectable in the form. `source_file_id` and `file_descriptions` use those IDs. The server constructs its own ownership context, ignoring browser claims.
- Values, tiers, provenance, ranges, question history, unknowns and measurement plans survive save/reload. Explicitly switching a calculation method clears inputs from its alternative so stale values cannot override the chosen method. Existing saved records are otherwise preserved. Changing a source file or passage clears confirmation and verification.
- Defaults remain labeled, explicitly accepted proxies. Team-settings integration is deferred per Zihao's review.
- Gap-list links `/projects/{id}?input={input_id}#intake` reveal and focus the requested control, including alternate or currently unselected driver inputs.

## Validation and remaining boundaries

The access matrix verifies incomplete and ready saves across signed-out, outsider, member and owner actors, checks actual stored canonical JSON, rejects forged evidence and stale writes, and checks the agent's draft rejection. Handoff tests cover draft hydration, unsupported content, canonical serializer round trips, engine compatibility and path selection. Browser verification covers real save/reload, persisted evidence selection and gap-link focus.

`shared/form.ts` is unchanged. The engine currently has a broader legacy-compatible form type (optional envelope fields, optional origin and a root discount field); canonical producer output is assignable to it, but the handoff test is not a claim of exact type equality. Eli's proposed drift test and ownership review remain the place to reconcile legacy typing without weakening input validation.

No real Gemini assessment is claimed from local verification: this environment has no model key. Eli can test a real run once the integration is merged and deployed. PR #129 is merged; the additional wave-two fixtures remain in PR #132. This frontend change does not merge either protected branch.

The previously observed browser download-service cancellation remains a manual limitation: producer bytes/filename and the copy fallback were verified earlier, without changing browser policy. This integration does not change the download mechanism.
