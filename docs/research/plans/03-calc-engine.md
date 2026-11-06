# Plan 03: Calculation engine and ROI.md (Eli, sole owner; Ryan's output reads the result)

Read `README.md` first. Issues: #82 M1 (ROI.md, Ag9), #83 M2 (engine output, Ag2), #84 M3, #85 M4, #86 M5, #87 Q1, #67 O3 (Ag7), #96 Q10. Reference: `ROI.md`, `roi_prototype.py`.

## Goal

A deterministic TypeScript engine (pure functions, no I/O) that turns the saved form file into NPV, ROI, payback, the steps behind each number, a confidence ledger, and a release decision.

## Decision: code computes (Q1)

All arithmetic is code. Models only collect, route, and explain. Reason: Sprint 4 R-03 promises tested arithmetic, and it is the only way to show repeatable results and pass published-case checks (P12).

## Conventions (Sprint 4 section 3.7, confirmed by Forrester TEI Appendix A)

Per driver, in order: gross, adoption, recapture (capacity benefits only), evidence haircut, cost uplift and schedule delay, discounting. Every step is logged.

- `NPV = -C0 + sum_t (B_t - C_t) / (1+r)^t`, initial investment at time 0 undiscounted, other flows discounted at year end.
- `ROI` returned **two ways, labeled**: `roi_undiscounted = (sum B - total costs) / total costs` (Sprint 4) and `roi_pv = NPV / PV(costs)` (Forrester and Priya). Zero cost: undefined, show net benefit.
- Payback: first period cumulative undiscounted net cash covers C0; "No payback within the selected horizon" otherwise.
- Always report hard-financial and capacity-inclusive results.
- Bounds: percents 0-100, horizon 1-20, delay 0-240 months, counts integers, no negatives. Round half-up at presentation only. Unknown never becomes 0.

## Engine input contract (aligned with `01a-input-structure.md`)

The engine reads one form file of `Input` records (`ROI.md` section 3.8). Ids, units and bounds are `ROI.md` section 3; the input team builds against the same list.

- **Roles:** `effect` inputs carry a tier and `backing` and get a haircut; `known` inputs are validated only; `cost` inputs get an uplift from their `basis`; `context` never enters a formula.
- **Backing score:** the six checks read `source_file_id` (.25), `second_source_value` within 20% (.20), `observations` >= 30 or `period_months` >= 12 (.20), `source_date` under 12 months (.10), `low`/`high` within +/-20% (.15), `verified` (.10). A missing field is a failed check, never an error.
- **Tier upgrade to `measured`:** only with `source_file_id` (same project) and `quote_confirmed`; otherwise the engine keeps the stated tier and records why.
- **Unknown:** `value: null` or tier `user_unknown` never reaches a formula. An essential cost that is null blocks the headline; a null effect input drops its driver to `unquantified` and into the gap list.
- **`validate_inputs` must reject:** unknown id, role/field mismatch (backing on a known input is ignored with a warning), out-of-bounds values, `after > before`, `source_file_id` from another project, bad adoption array length (must equal `horizon_years`).
- **Defaults** come from one table used by both the form and `get_defaults`.
- **Decided by Eli (Nov 5):** `cost_per_error`, `cost_of_delay_per_day`, `loss_per_event` are effect inputs; cost `basis` per line with `cost_uplift_pct` as optional override; measurement plan ids.

## Driver modules

- **Time savings (capacity value):** `hours = staff x (min_before - min_after) x tasks / 60`; `gross = hours x weeks x loaded rate`; `adjusted = gross x adoption_t x recapture x (1 - haircut)`. Hard savings only from a documented cash reduction.
- **Data quality (avoided cost):** `(errors_before - errors_after) x cost_per_error x adoption_t x (1 - haircut)`; with the Rule of Ten, `cost_per_error = clean unit cost x (multiplier - 1)`. Hard if cash cost, else capacity.
- **Decision speed:** `decisions x (days_before - days_after) x cost_of_delay_per_day x adoption_t x (1 - haircut)`; label by basis.
- **Risk reduction (avoided loss):** `ALE = ARO x SLE`; benefit = `(ALE_before - ALE_after) x adoption_t x (1 - haircut)`; customer-borne losses separate.
- **Costs:** one-time and recurring, each multiplied by `1 + uplift` (15 / 30 / 50% by quoted / estimated / assumed), delay shifts first benefit.

## Haircut and confidence (this is the new part)

Band by tier (non-overlapping): measured 0, documented 0-10, benchmark 10-25 (like-for-like only; vendor or trial figures moved to another setting are `estimate`), estimate 25-40, assumption 40-60 percent. `H = H_max - b x (H_max - H_min)` with backing score `b = .25 source + .20 corroborated + .20 coverage + .10 recent + .15 tight range + .10 verified`. Driver haircut = **max** over its effect inputs; driver confidence = **min** of `1 - H`. Release gate: driver floors 0.80 (time, data quality) and 0.85 (decision speed, risk); project floor 0.85 (benefit-weighted mean, capped by any driver over 30% of benefit). If the gate fails: `gap_list` (ranked missing evidence, with the confidence each item would reach), no headline. Consequence: an `estimate`-tier effect input never reaches the headline.
Scenarios: conservative / expected / optimistic by moving adoption, recapture, haircuts to band ends. Sensitivity: discount rate, adoption, haircut.
Sources behind the numbers: Forrester TEI (benefits cut 15-25%, costs up 10-15%), Green Book optimism bias (start at an upper bound and reduce by mitigation: the precedent for sliding), Flyvbjerg and Budzier (mean IT cost overrun 27%), Nucleus (recapture factor). Band edges and weights are team judgment; `haircutResearch.md` has the calibration table.

## Result shape (Ag2, owner Eli; the full type and a sample are in `04-output.md`)

`meta` (mode real or stub, formula and settings and contract versions), `headline` (npv hard and capacity-inclusive, both ROIs, payback, benefits PV, costs PV, or null with reason), `drivers[]` (label class, `steps[]` with ref id, formula, inputs, source type, value, tier; annual values; risk adjustment; total, PV, share; how measured; risk factors), `costs`, `cash_flows`, `scenarios`, `sensitivity`, `warnings`, `unquantified`, `proxies_used`, `overrides`, `flexibility`, `doing_nothing_risks`, `proceeding_risks`, `confidence` ledger. Overrides keep the computed value, reason, author, time.

## Guardrails (warnings)

One driver over 50% of benefit; over 50% from vendor-supplied numbers; same hours or events in two drivers; NPV sign flips within 3 points of the discount rate; assumption-tier inputs over 25% of benefit.

## Tests (M4) and fixtures (Ag7)

The KPIs, the independent published cases (Forrester TEI studies, Excel, Green Book, government worked examples) and the input families the tests must cover are in `../engine-test-plan.md`.

`roi_prototype.py` has 47 checks to port; 45 pass, 2 are recorded gaps.

| Fixture                                                                                                                                                                                       | Expected                                                                       | Status                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| F1 Sprint 4                                                                                                                                                                                   | gross $100,000, adjusted $20,000, NPV 1 year $8,181.82 at 10%, $9,417.48 at 3% | pass                                                                 |
| F3 ALE                                                                                                                                                                                        | $100,000 x 25% = $25,000 x ARO 3 = $75,000                                     | pass                                                                 |
| F4 Rule of Ten                                                                                                                                                                                | 62 x $1 + 38 x $10 = $442                                                      | pass                                                                 |
| F5 Forrester TEI benefit line                                                                                                                                                                 | 25% risk adjustment, 10% discount, PV $3,360,261                               | reproduced exactly                                                   |
| Priya components                                                                                                                                                                              | $59,371, $24,840, $152,400, $22,860, cost PV about $209,249                    | pass                                                                 |
| Priya headline                                                                                                                                                                                | NPV about $33,000, ROI about 16%                                               | **does not reproduce** (computed $42,919, 20.5%); do not use for P12 |
| Still needed (#67): 2-3 published cases, ideally a whole Forrester TEI study (test NPV and ROI end to end), compared within 10% (zero-reference rule in the spec).                            |
| Property tests: bands never overlap; measured is 0; haircut stays in band; adding a backing check never raises a haircut; floors and gate behave as specified; same inputs give same outputs. |

## Tool contracts

Tools in `ROI.md` sections 5 and 11.4 are thin wrappers over pure functions. Each logs a run event with step refs. The model can call tools but cannot edit the result.

## Open decisions

Floors and the 5% question trigger (test on real cases); goal-specific floors; how to load team-goal defaults; Q10 (how to compare when a model is in the loop: it should not be, for numbers).
