# Input question wording and source notes

Non-normative research retained from PR #127. The canonical producer contract is [shared/form.ts](../../../shared/form.ts), with the exact [engine handoff format](../samples/FORM-FILE-FORMAT.md). The old shared/types.ts proposal and its alternate envelope are superseded; no second FormFile type or adapter is introduced here.

Currency and horizon are envelope fields. Adoption and discount rate are input records. Requiredness, bounds, wire values and metadata come from the current form validator and field spec, not this wording table. Defaults below are labeled candidates requiring acceptance, not auto-filled facts.

| Field / control              | Suggested question                                                           | Who can answer             | Default candidate and source                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| project_name                 | What is the project called?                                                  | Project sponsor            | None; do not invent a business fact.                                                                            |
| decision_statement           | What funding or change decision should this assessment support?              | Project sponsor            | None; do not invent a business fact.                                                                            |
| currency                     | Which currency should the project use?                                       | Finance                    | USD (assumption): Team assumption: initial demo currency; confirm with finance.                                 |
| horizon_years                | How many years should we evaluate?                                           | Finance / sponsor          | 3 (assumption): Team assumption, consistent with the Priya example and Nucleus three-year practice (ROI.md S5). |
| discount_rate_pct            | What annual discount rate should we use?                                     | Finance                    | 10 (benchmark): Forrester TEI Salesloft 2022 Appendix A (ROI.md S11); proxy, not an organization-specific fact. |
| adoption_by_year             | What share of intended users will adopt the project in each year?            | Rollout / change owner     | None; do not invent a business fact.                                                                            |
| other_notes                  | Anything relevant we did not ask?                                            | Project sponsor            | None; do not invent a business fact.                                                                            |
| cost_one_time_vendor_license | What are the one-time vendor, license, integration and migration costs?      | Procurement / finance      | None; do not invent a business fact.                                                                            |
| cost_one_time_internal_labor | How much internal work is needed to build and roll out the project?          | Delivery manager / finance | None; do not invent a business fact.                                                                            |
| cost_training_change         | What will training and change management cost?                               | Change owner / finance     | None; do not invent a business fact.                                                                            |
| cost_annual_run              | What will the project cost to run each year?                                 | Service owner / finance    | None; do not invent a business fact.                                                                            |
| cost_annual_internal_support | How much internal support is needed each year?                               | Service owner / finance    | None; do not invent a business fact.                                                                            |
| cost_uplift_pct              | Do you need to override the cost contingency derived from each cost's basis? | Finance / reviewer         | None; do not invent a business fact.                                                                            |
| delay_months                 | How many months until benefits start?                                        | Delivery manager           | None; do not invent a business fact.                                                                            |
| baseline_alternative         | What happens, and what does it cost, if you do nothing?                      | Sponsor / finance          | None; do not invent a business fact.                                                                            |
| staff_affected               | How many people do this work?                                                | Team manager               | None; do not invent a business fact.                                                                            |
| minutes_per_task_before      | How many minutes does one task take today?                                   | Process owner              | None; do not invent a business fact.                                                                            |
| minutes_per_task_after       | How many minutes will the same task take after the change?                   | Process owner              | None; do not invent a business fact.                                                                            |
| tasks_per_staff_week         | How many of these tasks does each person do per week?                        | Process owner              | None; do not invent a business fact.                                                                            |
| hours_saved_per_staff_week   | Alternatively, how many hours does each person save per week?                | Process owner              | None; do not invent a business fact.                                                                            |
| weeks_per_year               | How many working weeks per year does this apply to?                          | Team manager               | 48 (assumption): Team assumption from the Priya / Sprint 1 illustration; not a universal working calendar.      |
| loaded_hourly_cost           | What is the fully loaded cost per working hour?                              | Finance / HR               | None; do not invent a business fact.                                                                            |
| recapture_pct                | What share of freed time becomes useful work?                                | Team manager               | 50 (benchmark): Nucleus C41 productivity correction factor; average/conservative proxy (haircutResearch.md).    |
| realized_as_cash             | What annual spending will actually be removed?                               | Finance / HR               | None; do not invent a business fact.                                                                            |
| records_or_events_per_year   | How many records or events are handled each year?                            | Data / operations owner    | None; do not invent a business fact.                                                                            |
| error_rate_before            | What percentage of records have errors today?                                | QA / data owner            | None; do not invent a business fact.                                                                            |
| error_rate_after             | What percentage of records have errors after the change?                     | QA / data owner            | None; do not invent a business fact.                                                                            |
| error_count_before           | Alternatively, how many errors occur per year today?                         | QA / data owner            | None; do not invent a business fact.                                                                            |
| error_count_after            | Alternatively, how many errors occur per year after the change?              | QA / data owner            | None; do not invent a business fact.                                                                            |
| cost_per_error               | What does one error cost?                                                    | Operations / finance       | None; do not invent a business fact.                                                                            |
| cost_per_clean_unit          | Alternatively, what does processing a clean unit cost?                       | Operations / finance       | None; do not invent a business fact.                                                                            |
| error_cost_multiplier        | How many times more costly is an erroneous unit than a clean unit?           | Operations / finance       | 10 (benchmark): Redman Rule of Ten; source status must be checked in SOURCES.md before external citation.       |
| stages_downstream            | How many downstream stages handle a bad record?                              | Process owner              | None; do not invent a business fact.                                                                            |
| cost_sources                 | Which kinds of error cost are included?                                      | Operations / finance       | None; do not invent a business fact.                                                                            |
| decisions_per_year           | How many decisions of this kind happen each year?                            | Decision owner             | None; do not invent a business fact.                                                                            |
| days_to_decide_before        | How many days does a decision take today?                                    | Decision owner             | None; do not invent a business fact.                                                                            |
| days_to_decide_after         | How many days does a decision take after the change?                         | Decision owner             | None; do not invent a business fact.                                                                            |
| cost_of_delay_per_day        | What does one day of delay cost, and what supports that figure?              | Finance / decision owner   | None; do not invent a business fact.                                                                            |
| cost_of_delay_basis          | What kind of value is lost during the delay?                                 | Finance / decision owner   | None; do not invent a business fact.                                                                            |
| example_decision             | Give a dated example of a decision affected by this delay.                   | Decision owner             | None; do not invent a business fact.                                                                            |
| event_type                   | What adverse event are you trying to reduce?                                 | Risk / service owner       | None; do not invent a business fact.                                                                            |
| aro_before                   | How often does this event occur per year today?                              | Risk / service owner       | None; do not invent a business fact.                                                                            |
| aro_after                    | How often does this event occur per year after the change?                   | Risk / service owner       | None; do not invent a business fact.                                                                            |
| loss_per_event               | What is the loss from one event?                                             | Risk / finance             | None; do not invent a business fact.                                                                            |
| asset_value                  | Alternatively, what is the exposed asset worth?                              | Risk / finance             | None; do not invent a business fact.                                                                            |
| exposure_factor_pct          | What percentage of the asset is lost in one event?                           | Risk / finance             | None; do not invent a business fact.                                                                            |
| cost_bearer                  | Who bears this loss?                                                         | Risk / finance             | organization (assumption): Team assumption: project organization bears the loss; explicitly confirm.            |
| cost_nature                  | Is the avoided cost a cash expense or freed capacity?                        | Finance / process owner    | No automatic cash classification. Applies to data quality and decision speed.                                   |

## File and follow-up prompts

- Which outcomes matter for this project? Select all that apply. At least one goal; no Revenue or Software goal.
- Do you have a document describing the proposed project? Optional PDF, MD or DOCX. Ask for a description; upload through project-scoped storage before using a file ID.
- What do these related files contain, and how do they relate to your project? Required for each selected file group. Read sheets as supplied; no cell-to-field mapping table. Production limits await Q7.

## Evidence questions

- Which project file and passage support this figure? Confirm the passage before using it.
- Do you have a second independent figure? What is it and where is it from?
- How many observations or months does the source cover?
- When was the source data recorded?
- What are the low and high values?
- Has a data owner checked it, and who?

## Measurement questions

- How will you measure this outcome: before/after comparison, survey, audit, or system report?
- What is the baseline and its source?
- Who owns the measurement, and how often will they check it?

## Additional context

- Where does this figure come from: a system record, a written source about your organization, comparable industry data, your estimate, or an assumption?
- Are these the same staff hours or events already included under another goal? Which benefit should count them?
- Vendor provenance is vendor_supplied metadata on the relevant input; ask whether the figure came from a vendor. It is not a new input ID.

Per-line cost uplift candidates remain 15 / 30 / 50 percent for quoted / estimated / assumed basis, labeled as team judgment in the research. The engine owns applying them; this table performs no calculation.
