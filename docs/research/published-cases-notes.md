# Published cases for the engine: notes (issues #67, #96)

Date: 2026-11-06. Owner: Eli. Files: `engine/fixtures/published/*.json`, `engine/tests/published-cases.test.ts`, recomputation `engine/fixtures/published/recompute.py`, sources `SOURCES.md` section L, table rows T9-T21 in `engine-test-plan.md`.

## What was added

Thirteen cases from nine Forrester Total Economic Impact studies, every table opened (PDF text or page HTML) and every row recomputed in plain Python before use. Ten go through `computeProject` as a single driver; three whole studies go through the finance layer.

| Driver / layer | Cases                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Time savings   | T9 Tealium productivity lift; T10 Semarchy business users; T11 Semarchy data stewards                                            |
| Data quality   | T12 Monte Carlo data downtime (rate path); T13 Camunda process errors (count path); T14 Thomson Reuters invoice errors (partial) |
| Decision speed | T15 Dagster faster time to value (cost of delay on initiatives); T16 Phenom time to fill (cost of vacancy per week)              |
| Risk reduction | T17 ThreatLocker breach risk (partial); T18 Broadcom SES Complete breach risk (reduction ramp 70/75/80%)                         |
| Whole study    | T19 Tealium, T20 Semarchy, T21 Broadcom: PV benefits, PV costs, NPV, ROI (T20, T21), payback under six months                    |

Result: all 13 reproduce the printed figures within printed rounding. Every annual driver figure is within $1 except Phenom (T16, up to 0.015%, because the study prints rounded wages). Whole-study PV and NPV are within $1.4. **No disagreement with the engine was found**, so nothing is marked `it.fails`.

## What is now covered by independent published evidence, and what is not

Covered (arithmetic only): all four driver formulas, with ramps by year, recapture 50/80/100%, both data-quality paths (rate and count), cost of delay per day, and ARO times loss with a reduction ramp; the finance layer on three more whole studies.

Not covered:

- The **sliding haircut, the backing checks, the confidence floors and the gate**. The test config flattens every band to the study's own flat risk adjustment and sets the floors to 0. These stay team judgment (SOURCES.md section F).
- **Cost uplift** and the **delay shift** (the studies have no delay input).
- **Hard cash vs capacity** separation, negative NPV, payback beyond "under six months" (all three studies print `<6 months`).
- An **independent, non-vendor** risk example (a safeguard ALE with answers, or a government avoided-loss case with its life and rate stated) and a **Reinertsen** worked example. T15 and T16 are cycle-time cost-of-delay cases, not approval-time decisions.
- The **Rule of Ten** is still only the $442 formula check (T8), not an end-to-end study.

## Mapping choices to know about (each is written in the fixture)

- A ramp over the years is carried by `adoption_by_year` (effect at full scale times adoption). It reproduces the printed years, but real adoption would be a different input.
- T15 and T16 treat an initiative or a hire as a "decision" and its cycle time as "days to decide". T16's vendor attribution (30%) is folded into days saved.
- T17 and T18 use a breach likelihood (a probability) as the event rate, as the studies do.
- T12 expresses a resolution-speed gain as a lower error rate; T14 uses one dollar of tax as one "record" ($1 per erroneous dollar). Both are chosen to exercise the rate path, and T14 is the least natural.
- T17 and T14 are partial: the insurance saving and the reconciliation cost are added by the test outside the engine, with the same risk adjustment.
- Every effect input is tagged `benchmark`, `estimate` or `assumption` (never `measured`); the studies give composite, interview-based numbers.

## Rejected or unusable (details in SOURCES.md section M)

Celigo (label contradicts text), Black Swan Farming / Maersk (only inequalities, chart is an image), Emergn VFQ (rate conversion only), Wikipedia cost of delay (its example is investment interest), WSU risk worksheet (no answers), Adjusters International / FEMA BCAR (secondary; life and rate unstated), Mississippi workbook (blank). Not accessible: ObservePoint (404), AWS modern data strategy (unreachable), InventiveHQ ALE pages (403; not worked around). Leads not opened: Ataccama full tables, Cornerstone, iCIMS, Pega 7, Nucleus case studies.

## Risks

- **Vendor-commissioned composites.** Forrester TEI studies are paid for by the vendor and use composite organizations. They are good for checking arithmetic against a published model; they are weak evidence that a real project will see these inputs. Say this wherever the cases are cited (the website page, the final presentation).
- **Circularity of mapping.** We chose how to map each table to our inputs (for example, adoption as the ramp). A different mapping could still match; the cases fix the arithmetic, not our input design.
- **Source stability.** `tei.forrester.com` pages are interactive and some show $0 when scripts do not run (the Thomson Reuters HTML did). Keep the extracted figures in the fixtures, and re-open the PDFs before the final presentation quotes them.
- **Rounding.** Studies print whole dollars from unrounded inputs, so exact equality is not possible. Tolerances are written in each fixture (`tolerance.why`).
- **Do not overclaim.** These cases do not validate the haircut model, the gate, or any team-judgment parameter.
