# Second-wave test cases for the form

The minimum set matches what the engine expects. This second wave is **more things the form needs to be able to take**. Nothing you built is wrong.

Baseline values are the `sample-result` project in `docs/research/samples/INPUT-TEST-CASES.md`. Each case below is that baseline with one change.

## New inputs the form needs (not in the minimum set)

| Input id                                        | What it is                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `decisions_per_year`                            | Decision speed: how many decisions a year (whole number)                                |
| `days_to_decide_before`, `days_to_decide_after` | Decision speed: days to decide today and with the project (effect inputs, with backing) |
| `cost_of_delay_per_day`                         | Decision speed: what one day of delay costs (effect input, with backing, no default)    |
| `cost_of_delay_basis`                           | `revenue_deferred`, `cost_continuing`, `risk_exposure` or `opportunity_lost`            |
| `example_decision`                              | Decision speed: a dated example decision (text)                                         |
| `realized_as_cash`                              | Time savings: documented cash reduction per year (effect input, with backing)           |
| `cost_bearer`                                   | `organization`, `customer` or `third_party`                                             |
| `delay_months`                                  | Months before benefits start (whole number, 0-240)                                      |
| tier `user_unknown`, and `value: null`          | Unknown is never stored as 0                                                            |

## The cases

For each case: `wave2/forms/<id>.form.json` is the form we expect your form code to produce, and `wave2/expected/<id>.json` is what the engine returns for it. The last column is a summary of that output.

| Case                        | What changes                                                                           | Expected engine outcome                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `driver-time-savings`       | Time savings only                                                                      | result; NPV capacity 8,452, hard null; payback 2.3 years; project confidence 0.935; unquantified data_quality+decision_speed+risk_reduction                                   |
| `driver-data-quality`       | Data quality only (cost_nature cash)                                                   | result; NPV capacity -18,642, hard -18,642; payback No payback within the selected horizon; project confidence 0.955; unquantified time_savings+decision_speed+risk_reduction |
| `driver-decision-speed`     | Decision speed only (new inputs)                                                       | result; NPV capacity 63,015, hard null; payback about 16 months; project confidence 0.965; unquantified time_savings+data_quality+risk_reduction                              |
| `driver-risk-reduction`     | Risk reduction only                                                                    | result; NPV capacity -12,491, hard null; payback No payback within the selected horizon; project confidence 0.935; unquantified time_savings+data_quality+decision_speed      |
| `combined-all-four`         | All four goals together                                                                | result; NPV capacity 266,290, hard 119,692; payback about 6 months; project confidence 0.9505                                                                                 |
| `class-hard-cash`           | Time savings with realized_as_cash 20000 (documented)                                  | result; NPV capacity 8,452, hard -27,322; payback 2.3 years; project confidence 0.935; unquantified data_quality+decision_speed+risk_reduction                                |
| `class-no-cash`             | Same as class-hard-cash without realized_as_cash                                       | result; NPV capacity 8,452, hard null; payback 2.3 years; project confidence 0.935; unquantified data_quality+decision_speed+risk_reduction                                   |
| `class-customer-borne`      | Golden plus cost_bearer customer                                                       | result; NPV capacity 65,129, hard -18,642; payback about 16 months; project confidence 0.935; warnings DRIVER_CONCENTRATION; unquantified decision_speed                      |
| `edge-zero-cost`            | All three costs set to 0                                                               | result; NPV capacity 203,275, hard 56,677; payback less than 1 month; project confidence 0.935; unquantified decision_speed                                                   |
| `edge-delay-6`              | Golden plus delay_months 6                                                             | result; NPV capacity 83,850, hard -30,940; payback about 17 months; project confidence 0.935; unquantified decision_speed                                                     |
| `edge-no-payback`           | Vendor cost 500000                                                                     | result; NPV capacity -412,543, hard -559,142; payback No payback within the selected horizon; project confidence 0.935; unquantified decision_speed                           |
| `edge-negative-npv`         | Vendor cost 200000                                                                     | result; NPV capacity -67,543, hard -214,142; payback No payback within the selected horizon; project confidence 0.935; unquantified decision_speed                            |
| `gate-all-pass`             | The golden project (all drivers pass)                                                  | result; NPV capacity 127,957, hard -18,642; payback about 11 months; project confidence 0.935; unquantified decision_speed                                                    |
| `gate-one-driver-dropped`   | Data quality inputs are estimates (driver drops, run still releases)                   | result; NPV capacity 71,280, hard null; payback about 15 months; project confidence 0.935; warnings DRIVER_CONCENTRATION; unquantified data_quality+decision_speed            |
| `gate-project-below-floor`  | Time savings only; hours benchmark with weak backing (driver passes, project does not) | gap list; project confidence 0.8025; dropped none; 2 item(s)                                                                                                                  |
| `gate-driver-over-30pct`    | Golden: time savings is over 30% of benefit, so it caps project confidence             | result; NPV capacity 127,957, hard -18,642; payback about 11 months; project confidence 0.935; unquantified decision_speed                                                    |
| `gate-estimate-effect`      | Time savings hours an estimate with full backing (cannot reach the headline)           | gap list; project confidence 0.6975; dropped time_savings; 2 item(s)                                                                                                          |
| `unknown-null-effect`       | hours_saved_per_staff_week is null (unknown)                                           | result; NPV capacity 44,186, hard -18,642; payback about 19 months; project confidence 0.935; warnings DRIVER_CONCENTRATION; unquantified time_savings+decision_speed         |
| `unknown-user-unknown-tier` | hours_saved_per_staff_week has tier user_unknown                                       | result; NPV capacity 44,186, hard -18,642; payback about 19 months; project confidence 0.935; warnings DRIVER_CONCENTRATION; unquantified time_savings+decision_speed         |

## Hand-off (same as before)

Generate each form with your real form code, save it as `engine/fixtures/forms/<case-id>.form.json`, validate it against the shared form type, run `pnpm check && pnpm test:smoke`, push a branch `feature/<issue#>-test-case-forms-2` (Refs #53), and open a PR into `develop`. Tell Eli when it is up. If your code cannot express a case, say so in the PR description instead of working around it.
