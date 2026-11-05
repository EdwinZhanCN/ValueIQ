# Test case inputs for the input team (Jonathan, Jeremiah)

Purpose: the calculation engine will be tested on form files produced by **your** form code, so we find mismatches before the pieces are connected. Build the form files below, hand them to Eli, and Eli feeds them straight into the engine. The AI assistant is inserted between the form and the engine later.

Read first: `docs/research/plans/01a-input-structure.md` (field ids, roles, bounds, the Input record and the form file skeleton). Field ids must match exactly. Expected outputs and the KPIs these cases serve are in `docs/research/engine-test-plan.md`.

## Hand-off (the short version)

Tell your coding agent:

1. Read this file and `plans/01a-input-structure.md`. Generate each form file below with **your real form code** (the serializer and validator, not typed-by-hand JSON), and validate it against the shared form type.
2. Save each as `engine/fixtures/forms/<case-id>.form.json`, run the checks for your area (`pnpm check && pnpm test:smoke`), push a branch `feature/<issue#>-test-case-forms` (Refs #53), and open a PR into `develop` titled "forms: test case inputs".
3. Message Eli when the PR is up. If your code cannot express a case (a field is missing, or a value is rejected that should be accepted), do not work around it: write it in the PR description. That is exactly what this exercise is meant to find.

Do not commit API keys or `.dev.vars`.

## Minimum set (needed first)

| Case id           | What it is                                                                  | Expected engine output                                               |
| ----------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `sample-result`   | The three-driver project below (all inputs documented, strong backing)      | `docs/research/samples/sample-result.json` (the released result)     |
| `sample-gap-list` | One time-savings driver backed only by a typed estimate                     | `docs/research/samples/sample-gap-list.json` (no headline, gap list) |
| `invalid-*`       | One form per invalid case listed in section 3 (each should be **rejected**) | A validation error naming the field; never a result                  |

## 1. `sample-result` (inputs)

Goals: `time_savings`, `data_quality`, `risk_reduction`. Currency USD. `horizon_years` 3. `discount_rate_pct` 10 (default, benchmark, origin default). `adoption_by_year` [50, 80, 90].

Backing checks use the six structured fields in `01a` section 2. "Checks" below means which of source / corroborated / coverage / recent / tight range / verified are true for that input.

| Input id                       | Value            | Tier       | Checks true (backing)                           |
| ------------------------------ | ---------------- | ---------- | ----------------------------------------------- |
| `staff_affected`               | 10               | known      | none needed                                     |
| `hours_saved_per_staff_week`   | 5                | documented | source, verified                                |
| `weeks_per_year`               | 40               | known      | none needed                                     |
| `loaded_hourly_cost`           | 50               | known      | none needed                                     |
| `recapture_pct`                | 50               | default    | origin default, tier benchmark                  |
| `records_or_events_per_year`   | 600              | known      | not used by the formula when counts given       |
| `error_count_before`           | 72               | documented | source, coverage, recent                        |
| `error_count_after`            | 24               | documented | source, coverage, recent                        |
| `cost_per_error`               | 690              | documented | source, coverage, recent                        |
| `cost_sources`                 | ["expedite"]     | context    | none                                            |
| `event_type`                   | sustained outage | context    | none                                            |
| `aro_before`                   | 3                | documented | source, verified                                |
| `aro_after`                    | 1.5              | documented | source, verified                                |
| `loss_per_event`               | 25000            | documented | source, coverage, recent, tight range, verified |
| `cost_bearer`                  | organization     | context    | none                                            |
| `cost_one_time_vendor_license` | 30000            | cost       | basis quoted                                    |
| `cost_training_change`         | 5000             | cost       | basis estimated                                 |
| `cost_annual_run`              | 12000            | cost       | basis quoted                                    |
| `delay_months`                 | 0                | known      | none needed                                     |

Attach a file reference (any id from the same project) wherever "source" is true. Do not set `measured` anywhere. The measurement plan can be left empty.

## 2. `sample-gap-list` (inputs)

Goals: `time_savings` only. Same `horizon_years`, `discount_rate_pct` and `adoption_by_year` as above. `staff_affected` 10, `weeks_per_year` 40, `loaded_hourly_cost` 50, `recapture_pct` 50 (default). `hours_saved_per_staff_week` 5, **tier estimate (typed by the user, no file), only check true: recent**. Costs: `cost_one_time_vendor_license` 30000 quoted, `cost_annual_run` 12000 quoted. Expected: no headline, because a typed estimate cannot reach the 0.80 time-savings floor.

## 3. Invalid cases (each form must be rejected, one problem per form)

| Case id                    | The one problem                                                 |
| -------------------------- | --------------------------------------------------------------- |
| `invalid-adoption-105`     | adoption of 105 in one year                                     |
| `invalid-negative-cost`    | a negative cost                                                 |
| `invalid-noninteger-count` | `staff_affected` 2.5                                            |
| `invalid-horizon-0`        | `horizon_years` 0 (also test 21)                                |
| `invalid-delay-241`        | `delay_months` 241                                              |
| `invalid-after-gt-before`  | `minutes_per_task_after` greater than `minutes_per_task_before` |
| `invalid-adoption-length`  | `adoption_by_year` length different from `horizon_years`        |
| `invalid-unknown-id`       | an input id that is not in `01a`                                |
| `invalid-wrong-file`       | a `source_file_id` that belongs to another project              |
| `invalid-null-essential`   | `cost_one_time_vendor_license` null                             |
| `invalid-measured-typed`   | a typed time saving tagged `measured`                           |

Your own form should reject these at entry (keep the previous accepted value). Eli's engine rejects them again: both layers should say no.

## 4. Second wave (after the minimum set)

Valid forms, one file each; the engine decides the outcome, you only need to produce valid forms:

- `driver-time-savings`, `driver-data-quality`, `driver-decision-speed`, `driver-risk-reduction`: one fully backed form per goal. Decision speed needs `decisions_per_year`, `days_to_decide_before/after`, `cost_of_delay_per_day`, `cost_of_delay_basis` and an `example_decision`.
- `combined-all-four`: all four goals together.
- `class-hard-cash`: time savings with `realized_as_cash` documented, and a copy without it.
- `class-customer-borne`: risk reduction with `cost_bearer` customer.
- `edge-zero-cost`, `edge-delay-6`, `edge-no-payback`, `edge-negative-npv`.
- `gate-all-pass`, `gate-one-driver-dropped`, `gate-project-below-floor`, `gate-driver-over-30pct`, `gate-estimate-effect`: vary tier and backing so each outcome is plausible.
- `unknown-null-effect`, `unknown-user-unknown-tier`.

Questions about these cases go to Eli (owner of the engine and the assistant).
