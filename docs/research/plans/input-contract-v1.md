# Input handoff v1: I2 / I3 proposal

Status: review proposal, November 5, 2026. Jonathan/Jeremiah own the questions and form shape. Eli reviews engine/assistant compatibility; Zihao reviews settings, persistence and file IDs. Nothing here claims their acknowledgement. References #51, #52, #53, #56, #91 and #93.

## Scope and sources

The release plan assigns I1-I6 to the input team. `01-input-team.md` describes the responsibilities; `01a-input-structure.md` supplies the field-by-field handoff; `ROI.md` sections 3 and 3.8 own engine IDs, units and evidence semantics. The integration contract owns storage/API boundaries. This proposal makes their missing envelope details concrete without implementing storage, the assistant, confidence arithmetic or the engine.

Reviewable artifacts:

- [TypeScript contract](../../../shared/types.ts).
- [Question/default catalog](../../../shared/input-catalog.ts).
- [Complete synthetic example](../examples/input-form-v1.ts).
- [Plain JSON export](../examples/input-form-v1.json), regenerated with `node scripts/export-input-example.mjs` from the typechecked example.
- [Contract checks](../../../scripts/input-contract.test.mjs) (`node --test scripts/input-contract.test.mjs`).

These are reference contracts, not a runtime parser. TypeScript does not validate untrusted JSON. Before any server/assistant adopts them, implement runtime validation on reads and writes, coordinate the owner reviews below, and add project ownership checks server-side. No shared API or engine field is considered frozen by this proposal.

## Envelope decisions proposed for review

1. `contract_version: 1` replaces the research skeleton's ambiguous `version`. Do not store two independently editable version fields. No persisted forms exist in this branch; migration of any independently implemented forms must be agreed before adoption.
2. Include `project_name`, `decision_statement`, selected `goals`, `currency`, `horizon_years`, `discount_rate_pct`, and `adoption_by_year` in the envelope. Do not duplicate them in `inputs[]`. `setting_evidence` records source/tier/origin for the four financial settings.
3. Record `source` for every input and setting, not just effect inputs. Structured `backing` remains exclusive to effect inputs; cost lines use `basis`. Roles and canonical units come from the catalog, not user-editable records.
4. `files[]` contains infrastructure-issued IDs and kind only. It carries no file bytes, browser `File` instances, local paths or R2 keys. `file_groups[]` preserves the UI grouping and required description. Each file belongs to exactly one non-empty group; `file_descriptions` is the derived per-file projection, never a separately edited description. The project-description file is a singleton group with its own description.
5. A draft may have empty decision text, unknown values and incomplete evidence. Calculation readiness additionally requires a non-empty decision statement and the selected goal's conditional requirements. This preserves the optional first-screen decision while making the engine handoff explicit.
6. A null input record requires `unknown_reason`; unanswered inputs can remain absent in a saved draft. Null envelope settings require an explanation in their `setting_evidence.note`. Explicitly excluded inputs are retained as null with a reason and offered as unquantified. Do not add zero values or force a tier upgrade to get past validation.
7. `asked[]` logs stable field IDs already presented. It does not mean those fields were answered, and must not suppress an explicit user-requested correction.
8. Preserve existing field IDs. Array notation in the research (`cost_sources[]`) means the JSON ID `cost_sources` with a string-array value, not literal brackets in the ID. This representation needs Eli's acknowledgement.

## Questions and combined goals

The catalog records wording, who knows the answer, type, role, unit, requirement, bounds, source-backed default candidates and conditional paths. Include common questions once, then the union of selected goal questions. Four goals have 15 non-empty combinations; do not maintain 15 duplicated questionnaires.

Ask plain-language source questions, not "choose a tier". Map system records plus confirmed passages to measured; written organization-specific sources to documented; comparable independent industry figures to benchmark; personal judgment to estimate; unsupported premises to assumption. Self-reported time saving never becomes measured. The assistant only proposes values; user acceptance is required.

Conditional readiness:

| Goal           | Required calculation path                                                                                                                        | Evidence / classification                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Time savings   | staff + (hours saved per person per week OR before/after minutes and tasks per person per week) + working weeks + loaded hourly cost + recapture | Documented cash reduction is separate and optional; absent cash reduction does not turn capacity into cash.                       |
| Data quality   | (annual volume and before/after error rates OR before/after error counts) + (cost per error OR clean-unit cost and multiplier)                   | Cost categories identify overlap with time-saving rework.                                                                         |
| Decision speed | decisions per year + before/after days + cost of delay per day + delay basis                                                                     | Dated example is recommended at intake; missing goal-specific backing can still fail preflight. Never invent delay cost.          |
| Risk reduction | event type + before/after annual frequency + (loss per event OR asset value and exposure factor) + cost bearer                                   | Fractional frequency is valid. Collect low/high and a loss basis in evidence notes; report customer/third-party value separately. |

If both alternative paths are supplied, ask which is authoritative; do not sum them. Common settings and cost lines are shared once across goals. Ask users which benefit owns an overlapping hour/event before the headline is released.

## Default policy

Default candidates are proposals, never auto-filled facts. No default is fabricated for project-specific counts, savings, costs or cost of delay. Null remains valid draft data; missing essentials are reported before calculation.

Financial settings (discount rate, horizon, recapture, uplift tiers) come from Zihao's versioned `team_settings` when available. The catalog provides starting candidates only, with source and tier. A project records the accepted value and its provenance; runs pin infrastructure's `settings_version`. Never replace an existing project's accepted value when team settings change.

`loaded_hourly_cost` has no numeric universal default. Salary x 1.35 is an explicitly labeled derivation requiring a salary period, working-time basis and user acceptance; it is not a direct hourly-rate multiplier applied without unit conversion.

Cost uplift is derived per line from quoted / estimated / assumed basis (15 / 30 / 50 percent). The optional `cost_uplift_pct` overrides it only when deliberately supplied. Do not silently add that field to every form or apply both adjustments.

## Validation and completion boundaries

Save-draft validation checks shape, recognized IDs, unique input/file IDs, finite values, value types, units and periods, bounds and enum options. Nulls and missing required answers are allowed in drafts. Readiness additionally checks conditional paths, essential costs, adoption length against horizon, before/after relationships, accepted defaults, evidence sufficiency and unresolved overlaps. Readiness is not the confidence release gate.

Percentages are 0-100; horizon is integer 1-20; delay integer 0-240 months. Staff, task counts, record counts and decision counts are integers. Annual risk frequency (`aro_*`) is non-negative and may be fractional. Before/after time and days require after < before; error and risk rates allow equality. Low <= value <= high when ranges are supplied. Reject invalid edits and retain the last accepted value.

The engine owns arithmetic and confidence, including evidence checks, tier bands, weakest-link aggregation and headline release. This handoff does not invent a second calculator. Same-project file ownership must be enforced by authorized server reads; an ID appearing in JSON is not proof of access.

## Review checklist and remaining work

- Input: approve question wording, who supplies each answer, conditional E/R/O rules and source labels. Implement the catalog in the UI after agreement.
- Eli: acknowledge envelope fields, source metadata, array encoding, measurement metric literals, version name and conditional paths. Align assistant and engine validators with this contract.
- Eli/input: resolve whether FTE-based cost records carry a computed monetary total or structured quantity/rate factors. The research lists compound units but does not define their wire representation. The example deliberately keeps those lines unknown rather than silently assuming an interpretation. Also acknowledge normalized unit spellings (`currency/h`, `currency/yr`, `events/yr`) before validators compare strings literally.
- Zihao: acknowledge group-to-file projection, persistent IDs and source metadata; confirm settings snapshot behavior. Supply authorized save/load/upload APIs.
- Q5: research direction is yes to units/source/period/tier; #91 remains open until the team records acceptance.
- Q7: production file types/count/size limits remain open (#93). UI selection caps are not Gemini capability claims.
- I6: serialize actual accepted UI values and uploaded file IDs after I3 agreement. The example is not a real project and must not be seeded into production.
- Add runtime parsing and negative boundary tests before wiring any untrusted JSON. Add persistence round-trip/access tests with infrastructure. Do not close I3 or I6 on compile-time checks alone.

## Verification of this proposal

`pnpm typecheck` and `pnpm lint` pass. `node --test scripts/input-contract.test.mjs` passes six checks covering all 15 non-empty goal combinations, default provenance, example field metadata, group/file projection, explicit unknowns and JSON export consistency. The full formatting check reports only the existing warnings in unchanged `CLAUDE.md` and `docs/TEAM_AGREEMENT.md`; authored files are formatted. These checks establish reference consistency, not production parsing, persistence, access control or confidence-gate correctness.
