# Sample engine outputs (stub) for the output team

Two example `RunOutput` files showing exactly what the calculation engine will return, so the output screens and report can be built and tested before the real engine is connected.

| File                   | `kind`     | What it shows                                                                                                                                                                                                                                  |
| ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sample-result.json`   | `result`   | A released result: three drivers (time savings as capacity value, data quality as hard savings, risk reduction as avoided loss), costs with uplift, cash flows, scenarios, sensitivity, charts, confidence ledger, narrative, measurement plan |
| `sample-gap-list.json` | `gap_list` | The gate failed: no headline, a ranked list of evidence to add, each with a link back to the intake screen                                                                                                                                     |

Both have `meta.mode = "stub"`, so show the STUB label. The shape is the `RunOutput` type in `docs/research/plans/04-output.md`.

## How the numbers were made

Computed by a script from the reference rules in `docs/research/reference/roi_prototype.py` (haircut bands, backing checks, floors, 10% discount rate, year-end discounting, initial cost at time 0). Nothing is typed by hand. The project is illustrative, not a real case. Checks: driver totals add up to the cash-flow benefits ($249,572.62); the headline PV benefits $203,275.29 and PV costs $75,318.56 give NPV $127,956.73 (capacity-inclusive). The real engine must reproduce these numbers from the same inputs; that is a test.

## What is deliberately in the samples so you can test the UI

- Hard NPV is **negative** (-$18,641.93) while capacity-inclusive NPV is positive, and hard payback reads "No payback within the selected horizon". Show both side by side, never merged.
- Both ROIs are present and different: undiscounted 202.88% and PV-based 169.89% (capacity-inclusive). Label both; never show a bare "ROI".
- The project confidence is capped by the time-savings driver (`capped_by`), because that driver is over 30% of benefit.
- One driver is `unquantified` (decision speed, not selected).
- The gap list has two items for the same input, each with `confidence_now` and `confidence_if_added`.
- `warnings` is empty in the sample. The guardrail warnings are listed in `04-output.md`; ask Eli if you want a sample with warnings filled.

## Differences from the type in `04-output.md` (this sample is newer; `04` will be updated with the engine)

- `Step` also has `label` (display text) and `by_year` (one value per year of the horizon). `value` is the sum over the horizon.
- `Driver` also has `label` (display name) and `included`.
- `sensitivity` also has `x_labels` naming what `x` means for each series (discount rate in percent, adoption multiplier, extra haircut in percentage points).
- Year 0 is a row in `cash_flows` holding the one-time costs.

Questions about the shape go to Eli (owner of the engine).
