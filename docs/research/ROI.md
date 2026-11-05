# ROI.md (DRAFT v0.1, 2026-11-04). Issue #82 (M1 / Ag9)

Owner: Eli, with Ryan. Status: first research pass done at search-result level. Every source marked **OPEN PRIMARY** still needs its original document opened before the demo writeup cites it.

## Purpose

One document that lets us do four things with confidence:

1. **Form inputs:** define the inputs the intake form collects (units, bounds, defaults, sources). Hand to Jonathan and Jeremiah (I1-I3).
2. **Master prompt:** drive the AI assistant so it covers gaps in the right order (A1, A3-A5).
3. **Engine:** specify a deterministic, tool-driven calculation engine. The AI ROI agent calls tools; it never does arithmetic (M2, M3).
4. **Output:** a structured result and report that follow industry practice (O4, O5).

Design rule (Sprint 4 R-03, Q1 recommendation): **code computes, AI collects, explains, and proposes.** AI suggestions are labeled proxies until the user accepts them.

---

## 1. Sources and what we take from each

| #   | Source                                                                                       | What we take                                                                                                                                                                                                                                                                                                      | Status                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Forrester Total Economic Impact (TEI)                                                        | Four parts: benefits, costs, flexibility, risk. Future flows discounted to present value. Estimates risk-adjusted because interview estimates vary. Public studies report risk-adjusted PV (e.g. Sage X3 study: $1,722,180 benefits vs $620,870 costs, NPV $1,101,310, 3 years). Studies are vendor-commissioned. | Found via search. **OPEN PRIMARY:** Forrester methodology appendix (the "triangular distribution" detail came from a secondary blog).                           |
| S2  | Redman, "Rule of Ten"; Friday Afternoon Measurement                                          | Work on a defective record costs about 10x work on a clean one. Worked example: 62 clean x $1 + 38 defective x $10 = $442. Hidden data factory: rework is invisible to accounting.                                                                                                                                | Found via secondary sources. **OPEN PRIMARY:** Redman HBR article / book. The 1-10-100 model is Labovitz and Chang (1992); the $100 failure tier is unverified. |
| S3  | Annualized Loss Expectancy                                                                   | ALE = SLE x ARO. SLE = asset value x exposure factor. ARO below 1 is a fraction (once per 4 years = 0.25). Example: $100,000 x 25% = $25,000; ARO 3 gives ALE $75,000.                                                                                                                                            | Found (Wikipedia, Netwrix). **OPEN PRIMARY:** NIST / ISO 27005.                                                                                                 |
| S4  | Cost of Delay (Reinertsen)                                                                   | CoD = value lost per unit time. Delay cost = CoD x time delayed. WSJF = CoD / duration. Reinertsen: most managers do not know their CoD, and intuitive estimates can differ 50 to 1. So CoD inputs must be evidence-tagged.                                                                                       | Found via Wikipedia and secondary. **OPEN PRIMARY:** "Principles of Product Development Flow".                                                                  |
| S5  | Nucleus Research                                                                             | "Inefficient transfer of time": saved hours are not all re-used. Multiply time saved by a productivity correction factor (>0 and <1). Cited ranges: sales roles 0.7-0.9; marketing 0.5 or lower. Loaded cost example 1.35 x base salary. 3-year horizon. Material is 2006-2014.                                   | Found. **OPEN PRIMARY:** Nucleus c41 "Quantifying productivity returns" PDF. This is our best published basis for the recapture rate.                           |
| S6  | UK Green Book optimism bias                                                                  | Cost and time uplift percentages by project category when better data does not exist. Supplementary guidance published 2013. Secondary report: upper bounds 66% non-standard civil, 44% standard civil (unverified).                                                                                              | Found. **OPEN PRIMARY:** gov.uk supplementary guidance table. IT project category numbers not yet captured.                                                     |
| S7  | OMB Circular A-94 Appendix C                                                                 | Real and nominal discount rates published yearly, for cost-effectiveness analysis.                                                                                                                                                                                                                                | Found the documents, did not capture values. **OPEN PRIMARY:** current Appendix C table. Fixture uses 10% until we fill this.                                   |
| S8  | SaaS value-selling practice (secondary blogs)                                                | Discover how the buyer defines ROI before calculating. Aim for the most defensible case, not the biggest number. Show conservative / moderate / optimistic scenarios. Recalculate with actual data after purchase. Transparent, documented assumptions.                                                           | Found (low quality). DecisionLink and Ecosystems methods not found. Vendor-owned. **OPEN:** search their published guides directly.                             |
| S9  | ISACA Val IT                                                                                 | Investment lifecycle framing.                                                                                                                                                                                                                                                                                     | Not yet searched.                                                                                                                                               |
| S11 | **Forrester TEI, "The Total Economic Impact of Salesloft" (Sept 2022), full PDF read**       | Report anatomy, benefit table layout with Ref IDs, risk adjustment %, 10% discount rate, financial summary. See section 10. Vendor-commissioned.                                                                                                                                                                  | **READ (primary example).**                                                                                                                                     |
| S12 | **Vermont IT Activity Business Case & Cost Analysis (IT ABC) instructions (Feb 2023), read** | State-government business case form: 4 value types, measurement, risk of doing nothing vs proceeding, current vs proposed lifecycle cost, hard-dollar rule. See section 10.                                                                                                                                       | **READ (instructions; the form itself not opened).**                                                                                                            |
| S13 | UK Green Book Five Case Model (strategic, economic, commercial, financial, management)       | Structure for a full business case; our report covers strategic + economic + financial; commercial and management are out of scope for the demo.                                                                                                                                                                  | Found via secondary guides. **OPEN PRIMARY:** gov.uk business case guidance.                                                                                    |
| S14 | GAO Cost Estimating and Assessment Guide (GAO-20-195G)                                       | Sensitivity analysis (vary major assumptions) and risk/uncertainty analysis (confidence level; Monte Carlo commonly used). Correlation ignored = spread understated.                                                                                                                                              | Found via secondary summaries. **OPEN PRIMARY:** gaoinnovations.gov chapter 12.                                                                                 |
| S15 | Nucleus Research ROI case studies / ROI Guidebook / "ROI Reality Check" (2026)               | Year-by-year benefits, net cash flow, annual ROI, NPV, payback. Guidebooks list typical benefits and costs with value ranges.                                                                                                                                                                                     | Found. **OPEN PRIMARY:** download a sample ROI Guidebook from nucleusresearch.com.                                                                              |
| S16 | PMI Benefits Realization Management (practice guide)                                         | Same benefits carried from business case into a benefits plan with owners; compare actual vs planned after launch.                                                                                                                                                                                                | Secondary only. Official PMI sample not found.                                                                                                                  |
| S17 | DoD CIO Business Case Analysis template; Mississippi ITS IT Project Business Case Workbook   | Government BCA structure.                                                                                                                                                                                                                                                                                         | **NOT READ:** DoD returned HTTP 403; Mississippi not opened.                                                                                                    |
| S10 | Our own docs                                                                                 | Sprint 4 section 3.7 (engine conventions), Sprint 1 (Priya, Maya), Requirements doc (adoption, success rate, additional profit).                                                                                                                                                                                  | In hand.                                                                                                                                                        |

Rule: any default value without a source in this table is labeled **team assumption** in the form file and the report.

---

## 2. Engine conventions (from Sprint 4 section 3.7, unchanged)

Per driver, in order: **gross -> adoption (x success factor if justified) -> recapture (capacity benefits only) -> evidence haircut -> cost uplift and schedule delay -> discounting.** Every step is logged.

- `ROI% = 100 x (sum B_t - (C0 + sum C_t)) / (C0 + sum C_t)`, undiscounted. Zero cost: ROI undefined, show net benefit.
- `NPV = -C0 + sum_t (B_t - C_t) / (1+r)^t`
- `Payback` = first period cumulative undiscounted net cash covers C0. Interpolate only under a stated uniform-flow assumption. No recovery: "No payback within the selected horizon".
- Report **hard-financial** and **capacity-inclusive** results separately. Time value counts as hard savings only with a separate documented spending reduction. Customer-borne benefits are labeled separately.
- Bounds: hours, counts, costs >= 0; counts are integers; percentages 0-100; discount rate 0-100; horizon integer 1-20; delay integer 0-240 months; uplift 0-1000%.
- Full precision internally. Round currency to 2 decimals and percentages to 1 decimal, half-up, at presentation only.
- Do not apply a reduction twice. Missing essential costs block the headline result. Unknown inputs never become 0 silently.

---

## 3. Input catalog (becomes the form file; hand to Jonathan and Jeremiah)

Every input carries: `id, label, unit, type, min, max, required, default, default_source, evidence_tier, period, info_text, question_text`. Evidence tiers: `measured | documented | benchmark | estimate | assumption | user_unknown`.

### 3.1 Project (all goals)

| id                               | unit     | notes                                                                                                                                                                          |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| project_name, decision_statement | text     | decision_statement is the "should we fund X" sentence                                                                                                                          |
| goals[]                          | enum     | time_savings, data_quality, decision_speed, risk_reduction (combinations allowed)                                                                                              |
| currency                         | ISO code | single currency per project                                                                                                                                                    |
| horizon_years                    | int 1-20 | default 3 (matches Priya and Nucleus 3-year practice, **team assumption**)                                                                                                     |
| discount_rate_pct                | 0-100    | default **10**. Basis: Forrester TEI assumes 10% (S11); TEI Appendix A says organizations typically use 8-16%. Sprint 4 fixture also uses 10. Cross-check with A-94 (S7) later |
| other_notes                      | text     | Free text for anything not asked. Assistant turns this into caveats. Required by plan P3                                                                                       |
| files[] with description         | file     | project description pdf/md/docx; each data file has a user-written description                                                                                                 |

### 3.2 Costs (shared)

| id                           | unit                     | notes                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cost_one_time_vendor_license | currency                 | quote, integration, data migration                                                                                                                                                                                                                                                                                                                                                                                                                               |
| cost_one_time_internal_labor | FTE-months x loaded rate | often forgotten (S1)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| cost_training_change         | currency                 | S1 cost category                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| cost_annual_run              | currency/yr              | hosting, license, support                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| cost_annual_internal_support | FTE x rate               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| cost_uplift_pct              | 0-1000                   | optimism bias on costs. **Tiered default by cost basis (APPLIED Nov 4, team judgment anchored to research):** quoted/contracted 15%, estimated 30%, assumed 50%. Anchors: Forrester TEI raises costs 10-15% (S11); Flyvbjerg and Budzier mean IT cost overrun 27% (1,471 projects, READ); Jorgensen about 30% (snippet); Green Book unmitigated ICT upper bound 200% and lower bound 10% (READ). Priya's 27% uplift on a vendor quote equals the Flyvbjerg mean. |
| delay_months                 | int 0-240                | go-live delay                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| baseline_alternative         | text + currency          | do-nothing cost, so ROI can be framed against inaction                                                                                                                                                                                                                                                                                                                                                                                                           |

### 3.3 Time savings

| id                                              | unit                  | notes                                                                          |
| ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| staff_affected                                  | int                   |                                                                                |
| minutes_per_task_before, minutes_per_task_after | min                   | OR hours_saved_per_staff_week directly                                         |
| tasks_per_staff_week                            | count                 |                                                                                |
| weeks_per_year                                  | 1-52                  | Priya uses 48; default 48                                                      |
| loaded_hourly_cost                              | currency/h            | S5: loaded cost around 1.35 x base salary if only salary given                 |
| adoption_by_year[]                              | % per year            | ramp, e.g. 50 / 85 / 90                                                        |
| recapture_pct                                   | 0-100                 | default **50, benchmark** (S5 range 0.5-0.9 by role; Sprint 4 fixture uses 50) |
| realized_as_cash                                | currency/yr, optional | documented spending reduction. Only this counts as hard savings                |

### 3.4 Data quality

| id                                  | unit                            | notes                                                                                      |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| records_or_events_per_year          | count                           |                                                                                            |
| error_rate_before, error_rate_after | % (or error_count_before/after) | Priya: 72 to 24 events                                                                     |
| cost_per_clean_unit                 | currency                        | baseline unit cost (S2)                                                                    |
| error_cost_multiplier               | x                               | default **10** (S2 Rule of Ten, benchmark). Use direct `cost_per_error` if the user has it |
| cost_per_error                      | currency                        | Priya: $690 per expedited shipment                                                         |
| stages_downstream                   | int, optional                   | each stage that re-handles a bad record                                                    |
| cost_sources                        | enum[]                          | rework, escalation, expedite, customer credit. Avoid double counting with time savings     |

### 3.5 Decision speed

| id                                          | unit         | notes                                                              |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| decisions_per_year                          | count        |                                                                    |
| days_to_decide_before, days_to_decide_after | days         |                                                                    |
| cost_of_delay_per_day                       | currency/day | S4. Hard to estimate: demand evidence or label `estimate`          |
| cost_of_delay_basis                         | enum         | revenue deferred, cost continuing, risk exposure, opportunity lost |

### 3.6 Risk reduction

| id                    | unit                    | notes                                                                       |
| --------------------- | ----------------------- | --------------------------------------------------------------------------- |
| event_type            | text                    | e.g. sustained outage                                                       |
| aro_before, aro_after | events/yr (fraction OK) | S3                                                                          |
| loss_per_event        | currency                | SLE, or asset_value x exposure_factor_pct                                   |
| cost_bearer           | enum                    | organization / customer / third party. Customer-borne is labeled separately |
| benefit_label         | fixed                   | "avoided loss"                                                              |

### 3.7 Cross-cutting

`evidence_tier` and a `backing` checklist per input (below). `confidence_level` is derived from the haircut, not typed in.

#### Sliding, confidence-based haircut (DECIDED by Eli, Nov 4)

Rationale: a flat Forrester-style 15-25% cut per benefit would understate well-evidenced gains (e.g. a 20% risk reduction proven from the org's own incident data). So the haircut is computed per input from how well it is backed, and logged in the audit trail.

**Step 1: tier sets a band** (non-overlapping, so the spec rule "weaker evidence never gets a smaller haircut" holds automatically). Band numbers are a **team assumption, not sourced**; they are anchored to Forrester's 15-25% benefit cuts (S11, read) and the Sprint 4 fixture's 20% benchmark:

| tier                                                                                                                                                                                                                                                                 | band (min - max haircut) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| measured (logs, exports, invoices, system reports attached; **user-typed or self-reported "time saved" does NOT qualify**, per METR and Humlum findings in `haircutResearch.md`)                                                                                     | 0 (fixed)                |
| documented (written source about this org: contract, SLA, audit)                                                                                                                                                                                                     | 0 - 10%                  |
| benchmark (**like-for-like** external figure: same task type, similar organization, independent source; labeled proxy). A vendor-sourced or controlled-trial figure _transferred_ to a different setting is tier **estimate** unless the user's own data confirms it | 10 - 25%                 |
| estimate (user or stakeholder judgment)                                                                                                                                                                                                                              | 25 - 40%                 |
| assumption (nobody can back it)                                                                                                                                                                                                                                      | 40 - 60%                 |

**Step 2: backing score b in [0,1] slides the haircut inside the band:** `H = H_max - b x (H_max - H_min)`. b is the weighted sum of yes/no checks (weights are a team assumption):

| check                                                                                                                                                                         | weight | how the engine knows        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------- |
| source file attached and cited                                                                                                                                                | 0.25   | file id on the input        |
| corroborated by a second independent source within 20%                                                                                                                        | 0.20   | second source on the input  |
| coverage: at least one full business cycle or n >= 30 observations                                                                                                            | 0.20   | period / sample size fields |
| recent: data newer than 12 months                                                                                                                                             | 0.10   | date on the source          |
| tight range: low/high within +/-20% of the point value                                                                                                                        | 0.15   | low/high fields             |
| verified by a data owner or the user's reviewer                                                                                                                               | 0.10   | confirmation flag           |
| Examples: benchmark with all checks passed -> H = 10%. Benchmark with none -> 25%. Estimate with two checks (0.45) -> H = 40 - 0.45 x 15 = 33.25%. Measured -> 0% regardless. |

**Rules:**

- The engine computes b and H from the checks; **AI confidence never lowers a haircut by itself** (spec F-15: AI suggestions are not used until accepted; model confidence is not calibrated). The AI may _propose_ the checklist answers and tier upgrades only by pointing to a file passage; the user accepts, the engine recomputes.
- A tier upgrade (e.g. benchmark -> measured) requires an attached file the engine can see.
- Haircut applies to the **effect inputs** that drive the benefit (hours saved, error reduction, days saved, ARO reduction), not to counts and rates that are simply known (staff, weeks, hourly cost) and not to costs (costs use the separate uplift, S6). Combining: **weakest link (DECIDED by Eli, Nov 4):** `H_driver = max(H_i)` over that driver's effect inputs. It is simple to explain ("this benefit is only as well backed as its weakest key input"), avoids stacking cuts on a driver with several inputs, and removes the need for a separate cap on combined haircuts. Ryan can still object, but this is the working rule.
- Every step is logged: tier, each check, b, band, H, and which inputs it hit. The report shows a per-driver "effective haircut" so readers can compare to TEI-style single percentages (S11: benefits down 15-25%, costs up 10-15%), without the flat cut.
- Sensitivity view: the engine re-runs with all haircuts at band max (conservative) and band min (optimistic) for the scenarios.
- Tests: for each tier, monotonic across bands; measured always 0; H within band; changing one check never moves H outside [H_min, H_max].

Cross-check (S11): Salesloft's flat 25% and 15% fall inside our benchmark and estimate bands, so the bands are consistent with the published practice while letting strongly backed inputs go lower.

---

## 4. Driver modules (formulas for the engine)

Let `A_t` = adoption in year t (decimal), `R` = recapture, `H` = haircut for the input's evidence tier.

**M-TS Time savings (capacity value):**
`hours_saved_week = staff x (minutes_before - minutes_after) x tasks_per_week / 60` (or entered directly)
`gross_t = hours_saved_week x weeks x loaded_rate`
`adj_t = gross_t x A_t x R x (1-H)` -> label **estimated capacity value**
`hard_t = realized_as_cash x (1-H)` only if documented -> label **hard savings**
Check: Sprint 4 fixture 10 x 5 x 40 x $50 = $100,000; x0.5 x0.5 x0.8 = $20,000.

**M-DQ Data quality (avoided cost):**
`avoided_events = events_before - events_after` (or rate x volume)
`benefit_t = avoided_events x cost_per_error x A_t x (1-H)`; if only the unit cost is known: `cost_per_error = cost_per_clean_unit x (multiplier - 1)`.
Label **hard savings** if the cost is cash (expedite freight), else **capacity value**.
Check: Priya (72-24) x $690 = $33,120.

**M-DS Decision speed (time value):**
`benefit_t = decisions_per_year x (days_before - days_after) x CoD_per_day x A_t x (1-H)`
Label by basis: incremental profit / avoided loss / capacity value. Warn when CoD tier is `estimate` or weaker (S4: intuition is poor).

**M-RR Risk reduction (avoided loss):**
`ALE_before = ARO_before x SLE; ALE_after = ARO_after x SLE; benefit_t = (ALE_before - ALE_after) x A_t x (1-H)`
Label **avoided loss**. Customer-borne losses are separate.

**Costs:** `C0 = one_time_costs x (1 + uplift)`. `C_t = run + internal support`, same uplift. Schedule delay shifts first benefit by `delay_months`. Then discount.

**Project:** sum drivers by label; compute NPV, ROI, payback twice (hard-only and capacity-inclusive).

**Guardrails (warnings, not blockers):** one driver > 50% of benefit; > 50% from vendor-supplied numbers; same hours or events in two drivers; NPV sign flips within +/-3 points of discount rate; any `assumption` tier above 25% of benefit.

**Scenarios (S8, S1):** run Conservative / Expected / Optimistic by moving A_t, R, H by fixed steps. Show all three; headline = Expected, labeled.

---

## 5. Engine as AI tools (deterministic; the AI only calls these)

| tool                                                                                                                                | input                             | returns                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validate_inputs(form)`                                                                                                             | form file                         | list of errors (bounds, missing required, missing essential cost), list of gaps ranked by effect on result                                                                     |
| `get_defaults(goal)`                                                                                                                | goals                             | default per input with source and tier (the labeled proxies)                                                                                                                   |
| `compute_driver(driver_id, inputs)`                                                                                                 | one module                        | ordered steps with formula, values, label                                                                                                                                      |
| `compute_project(form, scenario)`                                                                                                   | whole form                        | drivers, totals, NPV / ROI / payback in both bases, warnings                                                                                                                   |
| `sensitivity(form, param, range)`                                                                                                   | e.g. discount rate                | table (NPV across rates, etc.)                                                                                                                                                 |
| `explain_step(result, step_id)`                                                                                                     | one step                          | plain-text formula and inputs (text only, no new numbers)                                                                                                                      |
| `preflight_gate(form)`                                                                                                              | form file                         | dry run of validate + release gate, no result computed: per-driver confidence, which drivers are below floor, the cheapest fix for each (used by the intake assistant, step 5) |
| `compute_haircut(input_id)`                                                                                                         | one input's tier + backing checks | tier, checks passed, b, band, H, explanation (deterministic; used by `compute_driver`)                                                                                         |
| `propose_backing(input_id, evidence)`                                                                                               | AI points to a file passage       | a _proposed_ checklist answer or tier upgrade; not applied until the user accepts                                                                                              |
| `propose_adjustment(form, reason)`                                                                                                  | AI caveat from "other"            | a _proposed_ change, tier `assumption`, not applied until user accepts                                                                                                         |
| `apply_override(path, value, reason, author)`                                                                                       | accepted change                   | updated form; computed value retained next to the override                                                                                                                     |
| Rules: the AI may not return a number that did not come from a tool. Every result carries `formula_version` and `settings_version`. |

---

## 6. Master prompt for the input assistant (draft; Eli owns, A1/A3-A5)

```
ROLE: You are the ValueIQ intake assistant. You help a project owner build a
finance-ready business case. You never calculate, estimate, or invent numbers.
All arithmetic is done by tools. Anything you suggest is a PROXY and is not used
until the user accepts it.

INPUTS YOU RECEIVE: form.json (answers, defaults, file descriptions), the
project goals, and the input catalog from ROI.md section 3.

STEP 1 DEFAULT CHECK. Call get_defaults. If default values are not filled, ask once:
"Use industry defaults for the rest?" and list each default with its source and
evidence tier. On yes, write them to form.json tagged tier=benchmark or
team_assumption. On no, mark those inputs as required questions.

STEP 2 MISSING CHECK. Call validate_inputs. Use file descriptions first; open a
file only if its description cannot answer. PRE-FILL every value you can find in
the files (show the file and passage, user confirms with one tap). Rank gaps by
effect on the result, essential costs first, then the biggest benefit driver.

STEP 3 QUESTION CARDS (ask once, capture everything in the same card). For each gap
ask one card, max 4 fields: label, unit, why it matters (info text), options:
Confirm / Not sure / Use labeled proxy / Exclude. Ask only for inputs in the
catalog for the chosen goals. Skip unrelated goals. Validate bounds (percent
0-100, no negatives). In the SAME card as the value, capture its backing, because
the engine's haircut and confidence depend on it:
  - source: attach or point to a file (or say "my estimate"),
  - period and sample: what time span / how many observations,
  - range: low and high, not just one number,
  - second source if one exists, and who verified it.
Offer these as optional chips with defaults inferred from the files, so a user who
has nothing to add taps Confirm and moves on. If a number looks like adoption above
100, or duplicates another driver (same hours or events), ask to correct it now.
Prefer asking the one effect input that moves the result most; do not ask for
low-effect inputs that already have a labeled default.

STEP 4 THE REST. Ask the open question: "Anything relevant we did not ask?"
Store the answer in other_notes. Run propose_adjustment for any caveat; show it as
a proposal. For each driver propose how it will be measured after launch
(measurement plan inputs: metric, baseline, method, owner, how often).

STEP 5 PRE-FLIGHT (reduces surprises on the loading page). Call preflight_gate on
the completed form. It runs validate_inputs and a dry run of the release gate
(confidence floors) WITHOUT computing a result. If a driver is below the floor,
tell the user now, with the single cheapest fix (for example "attach the incident
log to raise confidence from 0.72 to 0.90", or "we can drop this benefit to
unquantified"). Fix or exclude before submit. Also check: every essential cost is
present, no input is a self-reported time saving tagged "measured", no two drivers
count the same hours/events, goals match the questions asked. The engine agent
should then rarely need ask_user.

STOP RULES: Target 95% coverage of required fields. If the user is stuck 3 times
on the same field, offer a proxy or exclude. Excluded benefits are listed as
unquantified; they are never zero. Never reveal or change engine formulas.
User effort: batch related fields in one card, never ask the same thing twice
(keep an asked[] log in form.json), never ask what a file or default already
answers unless the effect on the result is large, and stop asking when the
pre-flight gate passes.

OUTPUT: updated form.json and a short list: confirmed, proxy (accepted),
excluded, unresolved.
```

---

## 7. Output contract (engine result, JSON shape for Ag2; Ryan's UI reads this)

```
result: {
  meta:{ currency, horizon_years, discount_rate, scenario, formula_version, settings_version },
  headline:{ npv_hard, npv_capacity_inclusive, roi_hard, roi_capacity_inclusive,
             payback_hard, payback_capacity_inclusive,
             benefits_pv, costs_pv },                        // null + reason when undefined (TEI exec-summary set, S11)
  drivers:[{ id, label_class:"hard_savings|capacity_value|avoided_loss|incremental_profit|customer_benefit",
             steps:[{ ref:"A1", order, name, formula, inputs, source_type:"user|file|default|proxy|calculated",
                      value, evidence_tier }],              // TEI-style Ref IDs and Source column (S11)
             annual:[...], risk_adjustment_pct, total, pv, share_of_benefit,
             measured_by:"how achievement will be verified",   // Vermont IT ABC (S12)
             risk_factors:["what makes this vary"] }],          // TEI per-benefit "Risks" paragraph (S11)
  flexibility:[...], doing_nothing_risks:[...], proceeding_risks:[...],  // S11 flexibility; S12 section 5
  costs:{ one_time, annual:[...], uplift_applied, delay_months },
  cash_flows:[{ year, benefits_hard, benefits_capacity, costs, net, cumulative }],
  scenarios:{ conservative, expected, optimistic },
  sensitivity:{ discount_rate:[...], adoption:[...], haircut:[...] },
  warnings:[...], unquantified:[...], proxies_used:[...], overrides:[...]
}
```

Report sections follow TEI (S1) and value-selling practice (S8): Summary and recommendation; Benefits by class; Costs; Risk adjustments and evidence tiers (S1 risk, S6 optimism bias); Flexibility / unquantified benefits; Scenario comparison; Sensitivity; Assumptions and sources; Audit trail (every step above).
Charts (fixed set, plan P9): waterfall (gross -> adopted -> recaptured -> haircut -> adjusted), driver contribution, sensitivity.

---

## 8. Test fixtures (P12)

| Fixture                                       | Source                                                                                   | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 time savings                               | Sprint 4 section 1.4                                                                     | gross $100,000; adjusted $20,000; 1-yr NPV $8,181.82 at 10%, $9,417.48 at 3%; capacity ROI 100%                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| F2 Priya                                      | Sprint 1 scenario 1                                                                      | gross time $208,320; Year-1 $59,371; expedite $33,120 -> $24,840; one-time cost $120,000 -> $152,400; run $18,000 -> $22,860; 3-yr NPV about $33,000; ROI about 16%; payback about 27 months. **Tested Nov 4 (`roi_prototype.py`):** components reproduce exactly (adoption 60/85/90%, recapture 50%, haircut 5% -> $59,371; expedite x0.75 -> $24,840; 27% cost uplift -> $152,400 and $22,860; cost PV about $209,249). The headline does NOT: computed 3-yr NPV $42,919 vs published "about $33,000" (30% off) and PV-based ROI 20.5% vs "about 16%". So **Priya is illustrative only: use for component tests, not P12.** |
| F3 ALE                                        | Wikipedia                                                                                | $100,000 x 25% = SLE $25,000; ARO 3 -> ALE $75,000                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F4 Rule of Ten                                | Redman                                                                                   | 62 x $1 + 38 x $10 = $442                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F5 TEI single benefit (published, reproduced) | Forrester Salesloft 2022, "Profit growth from increase in annual prospecting activities" | Unadjusted 3-yr: $1,279,688 / $1,919,531 / $2,303,438. Risk adjustment 25% -> $959,766 / $1,439,648 / $1,727,578 (total $4,126,992). Discount 10%, end-of-year -> PV **$3,360,261**. **I reproduced all of these exactly** in Python (note: only this benefit line; the whole study needs all lines). Also 650 salespeople x 15% x 5,000 activities = 487,500. Headline: ROI 394%, benefits PV $12.10M, NPV $9.66M, payback under 6 months (ROI = NPV / cost PV = 9.66 / 2.44 = 396%, consistent within rounding of the published millions).                                                                                  |
| Published cases                               | TBD (#67 O3)                                                                             | Candidates: public Forrester TEI studies (e.g. Sage X3: benefits $1,722,180, costs $620,870, NPV $1,101,310, 3 yr). Need the composite inputs and the discount rate used; compare within 10% per spec. Caveat: studies are vendor-commissioned and report risk-adjusted values.                                                                                                                                                                                                                                                                                                                                               |

---

## 9. Gaps and next steps

1. Open the primary docs marked OPEN PRIMARY (S1, S2, S5, S6, S7 first).
2. Fill Green Book IT optimism bias uplift and current A-94 discount rate.
3. Reproduce F2 (Priya); find 2-3 published cases for P12.
4. Find DecisionLink / Ecosystems / vendor ROI calculator inputs for the SaaS-branch note (kept out of the demo path, see `SaaS-branch.md` when created).
5. Send section 3 to Jonathan and Jeremiah, section 7 to Ryan, section 6 to myself for A1. These handoffs were due Nov 4 noon.
6. Q1 sign-off from Ryan (code does the math).
7. Q5: confirm every input carries unit, source, period, tier (this draft assumes yes).
8. Before closing #82: update diagrams and CRC cards.

---

## 10. Report exemplars and what they change (added after the report research)

Exemplars actually read: **Forrester TEI Salesloft 2022 (S11)** and **Vermont IT ABC instructions (S12)**. Others are found-but-unread (see section 1).

### 10.1 Forrester TEI report anatomy (S11, 31 pages)

1. Executive Summary: headline box **ROI 394% | Benefits PV $12.10M | NPV $9.66M | Payback <6 months**, plus a bar chart of benefits by category.
2. Customer journey: key challenges, solution requirements, composite organization (the assumptions all numbers rest on).
3. Analysis of Benefits: one subsection per benefit with a narrative, then a table: **Ref ID (A1...), Metric, Source (Composite / Assumption / Interviews / formula such as A1*A2*A3), Year 1-3**, then "Risk adjustment %", then risk-adjusted row, 3-year total and PV, then a **"Risks" paragraph** listing what makes the result vary.
4. Unquantified benefits and Flexibility.
5. Analysis of Costs: same table format; risk adjustment raises costs.
6. Financial Summary: cash-flow chart and table (initial, Year 1-3, total, PV), ROI, NPV, payback, discount rate stated (10%).
7. Appendix A: method definitions (see section 10.4). Appendix B and endnotes.

### 10.2 Vermont IT ABC anatomy (S12, state business case, required over $100K lifecycle)

Project info; security screen; **business value by 4 types (Financial, Customer Service, Risk reduction, Compliance), each with "how will achievement be measured"** (before/after comparison); other governments using the solution; **risk of doing nothing vs risk of proceeding with mitigation**; lifecycle of proposed solution (max 5 years); current-solution annual cost (software, hosting, hardware pro-rated, supplies, labor, maintenance); proposed implementation and operating cost lines; **net change to the State (proposed lifecycle cost minus current lifecycle cost)**; funding status; comments; approval.
Rules that match ours:

- "Don't claim Financial value if new lifecycle costs exceed current costs."
- Labor savings are entered as dollars **only if positions or overtime are actually eliminated**; if freed time is just reallocated, leave it blank and list it as a business value instead. This is exactly our hard-savings vs capacity-value rule, now confirmed by a government form (S12).

### 10.3 What this validates in our design

| Our decision                                                    | Evidence                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Split hard savings and capacity value                           | S12 labor rule; Nucleus correction factor (S5); TEI "time recaptured" benefit with a recapture % (S11)  |
| Discount at 10% by default, end-of-year, initial cost at time 0 | S11 Appendix A: initial investment not discounted, other flows discounted at end of year; typical 8-16% |
| ROI = net benefit / cost; NPV; payback as breakeven             | S11 Appendix A definitions match Sprint 4 section 3.7                                                   |
| Risk-adjust both sides (haircut benefits, uplift costs)         | S11: benefits down 15-25%, costs up 10-15%; S6 optimism bias                                            |
| Every number traceable                                          | S11 Ref IDs and Source column                                                                           |
| Show unquantified benefits instead of zero                      | S11 "Unquantified benefits"; our decision 6                                                             |
| Compare to doing nothing                                        | S12 section 5 and current-vs-proposed cost                                                              |
| Baseline/Expected/Optimistic scenarios                          | S8, S14                                                                                                 |

### 10.4 What this adds (changes made or recommended)

Made in this file: discount default sourced; output contract gets `ref`, `source_type`, `risk_factors`, `measured_by`, `flexibility`, `doing_nothing_risks`, `proceeding_risks`, `benefits_pv`, `costs_pv`; fixture F5 added.
Recommended (needs your/Ryan's call):

1. **Report skeleton** (Ryan's O5), in this order: Executive summary (headline box + benefit chart) -> Context and assumptions (what was entered, from where) -> Benefits by driver (table with Ref IDs, source, risk adjustment, risks paragraph) -> Costs -> Unquantified benefits and flexibility -> Financial summary (cash-flow chart, NPV/ROI/payback in both bases) -> Scenarios and sensitivity -> Risks of doing nothing vs proceeding -> Measurement plan -> Appendix: formulas, sources, audit trail.
2. **Measurement plan section: DECIDED yes (Eli, Nov 4)**, scoped to _how each benefit will be measured and the plan to do so_: per driver, the metric, baseline value and source, how it will be measured after launch (before/after, survey, audit, system report), who owns it, how often, and the check date. From S12 (Vermont "how will achievement be measured") and PMI (S16, compare actual to planned). The engine only fills the baseline and target numbers; wording is written by the AI from `benefit_measurement_method` + `risk_factors` and shown as text, with no new numbers.
   **Haircut decision (Eli, Nov 4): use the sliding confidence-based haircut in section 3.7, not a single TEI-style percentage.**
3. **Input additions** from S12: lifecycle (years) already covered by horizon; add `current_solution_annual_costs` (software, hosting, hardware, labor, maintenance) so "net change vs today" can be computed; add `benefit_measurement_method` (before/after, survey, audit) per driver; add `funding_status` optional. Not for the demo critical path.
4. **Interpretation of "industry standard":** there is no single standard PDF. TEI (analyst-style, vendor-commissioned) and government business cases (Green Book five case, state IT ABC forms) agree on the core: baseline, benefits and costs with risk, financial metrics at a stated discount rate, alternatives or do-nothing, assumptions and sources, sensitivity. Our report should cover those and label itself a pre-funding estimate, not an audited result.

### 10.5 Honest limits of this research pass

- TEI reports are vendor-commissioned; numbers are illustrative of method, not independent evidence of typical returns.
- Not read: DoD CIO BCA template (HTTP 403), Mississippi ITS workbook, GAO guide chapters, Green Book primary text, a Nucleus ROI Guidebook, PMI guide. Do not cite them as read.
- The Salesloft PDF text extraction garbled some table columns, so only the line I reproduced numerically (F5) is trusted as a test fixture.

---

## 11. Calculation-agent master prompt, blocker questions, and confidence gate (added Nov 4)

Separate from the intake assistant prompt in section 6. This is the agent that runs the engine tools on the loading screen (Eli: L1-L3, M3). It is still a pipeline: it routes data to tools and explains tool outputs. It never computes.

### 11.1 Blocker questions to the loading page (minimal by design)

Purpose: a second check. The intake assistant may have missed something that only shows up once the engine is deep in the data. The agent asks only when it would otherwise proceed on an assumption.
Tool: `ask_user(question, why_blocking, affects:[driver_ids], options[], estimated_effect_pct)` -> renders a question card on the loading page (L2). Run continues in the background for unaffected drivers.
Rules:

- Ask only if ALL are true: (a) the value is not in the form, the file descriptions, the attached files, or the defaults; (b) a plain default/proxy would change a headline number by more than 5% or would push a driver below the confidence floor (section 11.2); (c) it was not already asked by the intake assistant (check the form file `asked[]` log).
- Max 3 questions per run, batched into one card where possible. After 3, remaining gaps become `unquantified`, not assumptions.
- Each question has a one-line reason and chips: value entry / Use labeled proxy / Exclude this benefit. Never invent an answer for the user.
- Every answer is written to the form file with source=user, tier from the user's backing, and goes through `compute_haircut` like any other input.
- Timeout: if unanswered, treat as Exclude (benefit moves to `unquantified`); never fall back to an unlabeled default.

### 11.2 Confidence ledger and release gate (never publish a weakly backed number as a result)

Principle: confidence is **derived from evidence and checks the code can verify, not self-reported by the model.** The model's own "I'm confident" is never an input. Two separate scores:

1. **Integrity (can we trust the arithmetic and wiring?)** pass/fail checks, all must pass:
   unit and bounds checks (section 2); formulas and settings versions recorded; every output number traces to a tool call and step ref; reconciliation (driver totals sum to the benefit total; cash flows sum to NPV by independent recomputation); no double counting flags unresolved; no essential cost missing; the explanation text contains no number not present in tool output (checked by a string/number scan).
2. **Evidence confidence (how well is each number backed?)** per input `c_i = 1 - H_i` from the sliding haircut (measured = 1.00). Propagate:
   - driver confidence `c_d = min of c_i over that driver's effect inputs` (weakest link, same rule as the haircut; so `c_d = 1 - H_driver`),
   - project confidence `c_p = benefit-weighted mean of included drivers' c_d`, then capped by the lowest included driver if that driver is more than 30% of benefit.
     Updated after every tool call, live, and stored in the result as a ledger.
     **Release gate (proposal, thresholds are a team decision and config values, not constants):**

- Integrity must be 100% or no output; show the failed check and ask or retry.
- A driver enters the headline only if `c_d >= driver_floor` (proposal 0.80). Otherwise it moves to `unquantified` with the reason and the one thing that would raise its confidence (for example "attach incident log").
- The headline is released only if `c_p >= project_floor` (proposal 0.85) after dropping those drivers. If not, the run does not produce a number. It shows "not enough backed evidence to give a result" plus the ranked list of what to supply. **We never display a low-confidence headline, and we never display a precise figure whose backing we cannot show.**
- We still display a confidence band and the effective haircut for the released result, so a high number is never shown without its evidence.
  Anti-overclaim guardrails (your concern that users treat output as ground truth):
- The report states what the number is: "pre-funding estimate, based on N measured, N documented, N benchmark, N estimated inputs".
- Every sentence the agent writes about a number must cite a step ref; the integrity scan rejects uncited numbers.
- The agent cannot raise confidence by wording. Only new evidence (file, second source, user confirmation) changes the checks.
- Wide-range reporting: show low/expected/high (scenarios) next to the headline.

### 11.3 Draft system prompt for the calculation agent

```
ROLE: You are the ValueIQ calculation agent. You run deterministic engine tools
over the saved form file and explain results. You never calculate, round, or
estimate a number yourself. Any number you state must come from a tool result and
cite its step ref (e.g. [A7]).

LOOP: validate_inputs -> for each driver: compute_haircut per effect input, then
compute_driver -> compute_project -> sensitivity -> get_confidence ->
release_gate -> write summary and measurement plan from tool output only.

BLOCKERS: If a needed value is missing and not in the form, file descriptions,
files, or defaults, and using a proxy would change a headline number by >5% or push
a driver under the confidence floor, call ask_user (max 3 per run, batched, never
repeat the intake assistant's questions). Continue unaffected drivers in the
background. If unanswered, exclude the benefit; never assume.

CONFIDENCE: After every tool call call get_confidence. Do not publish a result
unless release_gate passes. If it fails, return the gap list (what evidence would
raise confidence, ranked by effect) instead of a number. You cannot raise
confidence by explanation. Report confidence as computed, never as your opinion.

OUTPUT: result JSON from section 7, summary text with step refs, measurement plan,
unquantified list, proxies used, effective haircut per driver.
```

### 11.4 Tools added

`get_confidence(result)` returns ledger (integrity checks, per-input c_i, per-driver c_d, c_p, floors). `release_gate(result)` returns pass/fail with reasons and the ranked gap list. `ask_user(...)` as above (UI contract with L2/#79).

### 11.5 Decisions

Decided by Eli, Nov 4:

1. **When the gate fails, show the gap list only** (what evidence is missing, ranked by effect). No partial headline. (Drivers that passed are still kept in the saved run so the user does not redo work.)
2. **Weakest link** for combining inputs, for both haircut and confidence.
3. **`ask_user` design approved** as written in 11.1.
   Still open:
4. Floors (0.80 / 0.85) and the 5% question trigger: set with Ryan, test against F2 (Priya) and F5.
5. Do thresholds depend on goal? Risk reduction may need a higher floor than time savings.
6. Haircut band changes suggested by `haircutResearch.md` (wider benchmark top for vendor/trial figures, tiered cost uplift, tighter "measured" definition): not applied until approved.

---

## 12. Tests run, per-goal floors, and updates (Nov 4, after Ryan agreed)

### 12.1 Test results (`roi_prototype.py`, reference oracle; run `python -I roi_prototype.py`)

47 checks, 45 pass, 2 fail on purpose-recorded known gaps.

- **Pass, published:** F1 Sprint 4 fixture ($20,000 adjusted; NPV $8,181.82 at 10%, $9,417.48 at 3%); F3 ALE; F4 Rule of Ten; **F5 Forrester TEI benefit line (risk-adjusted flows and PV $3,360,261 exact)**; TEI ROI is PV-based (394% vs 396% from published millions).
- **Pass, model:** measured = 0% always; every tier at band min with all checks and band max with none; bands never overlap (weaker tier never gets less); adding a check never raises a haircut; weakest link = max haircut; the gate drops weakly backed drivers and keeps strong ones; fully measured inputs get 0% (versus a flat 25% TEI-style cut), so strongly backed gains are not understated.
- **Fail (known, recorded):** Priya headline NPV ($42,919 computed vs about $33,000 published) and ROI (20.5% PV-based vs about 16%). Her components reproduce exactly, so the Sprint 1 headline figures were not derived consistently. Do not use Priya for P12.
- **Finding for Ryan, ROI definition:** Sprint 4 section 3.7 defines ROI on undiscounted totals; Forrester TEI (and Priya's "16%") define ROI as NPV / PV of costs. For P12 against published TEI cases, compare like with like. **Recommendation:** engine returns both, labeled `roi_undiscounted` (spec) and `roi_pv` (TEI-style), and the report states which is the headline. Needs your/Ryan's sign-off.
- **Implication of the bands plus floors (important for the demo):** confidence per input is 1 - haircut. An `estimate`-tier input can reach at most c = 0.75, which is below every proposed floor. So **a benefit that rests on a user's bare estimate can never appear in the headline**; it goes to `unquantified` with the evidence that would upgrade it (attach a log, a second source, a benchmark). A like-for-like benchmark needs backing score b >= 1/3 to pass 0.80 and b >= 2/3 to pass 0.85. This is consistent with Priya's "Validated" (5% haircut) vs "Review" (25% haircut) statuses. It also means intake must collect backing early (section 6 step 3 and the pre-flight gate).

### 12.2 Per-goal floors: research and recommendation

Finding first: **no published source sets confidence thresholds by value-driver type.** The recommendation below is judgment informed by how reliable the evidence for each driver type tends to be; the numbers are config values to tune, not constants.

| Goal                                                                                                                                                                                                                                                         | What the evidence says (source status)                                                                                                                                                                                                                                                                                                                                                                                           | Recommended driver floor                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Time savings                                                                                                                                                                                                                                                 | Self-reported savings are unreliable: METR RCT (devs predicted 24% faster, were 19% slower), Danish study 2.8% of hours vs 15%+ in trials (both READ via haircutResearch.md). But inputs can be measured from time samples and logs, and the spec separates capacity value from cash.                                                                                                                                            | **0.80**                                                                   |
| Data quality                                                                                                                                                                                                                                                 | Rule of Ten is a rough heuristic (secondary sources). Headline "cost of bad data" figures are weakly documented: Gartner's $12.9M comes from a vendor reference-customer survey of 154 organizations where 59% do not measure data quality (secondary search results, NOT primary); Redman says the IBM $3.1T figure's method was not disclosed (secondary). Error counts are measurable; dollar cost per error usually is not.  | **0.80** (weakest link will usually be cost per error, so attach invoices) |
| Decision speed                                                                                                                                                                                                                                               | Cost of Delay estimates are poor: Reinertsen reports intuitive estimates spread 50:1 (secondary). McKinsey's decision-speed research is correlational (1 primary article found, details only via search); no source shows speeding up decisions causes a dollar gain.                                                                                                                                                            | **0.85**                                                                   |
| Risk reduction                                                                                                                                                                                                                                               | ALE is a product of two uncertain estimates (frequency x loss) and rare events leave little data; no independent empirical validation of ALE/FAIR ranges was found (search results were vendor explainers). Experts are overconfident: Hubbard reports people hit about 11 of 20 90%-confidence ranges where 18 is calibrated (secondary summary; Lichtenstein and Fischhoff 1980 says training helps only to a limited extent). | **0.85**                                                                   |
| Project floor stays **0.85** (Ryan agrees). Limits: the Hubbard, McKinsey, Gartner, Reinertsen and ALE-critique points are from secondary search results and not verified against the primary papers; do not cite them in the writeup until opened.          |
| Also recommended: goal-specific required backing, not just a floor. Time savings must come from a time sample or logs (not a typed number); risk reduction must give a range (low/high) and a loss basis; decision speed must give a dated example decision. |

### 12.3 Haircut research suggestions: applied

1. **Measured definition tightened** (self-reported not measured).
2. **Benchmark band kept at 10-25%** and tightened to _like-for-like_; vendor/trial figures transferred to a new setting are tier `estimate` (25-40%). I chose this instead of widening the benchmark band to 40% because overlapping bands would break the spec rule that weaker evidence never gets a smaller haircut.
3. **Cost uplift tiered** (15 / 30 / 50% by quoted / estimated / assumed), in section 3.2. These three numbers are team judgment anchored to Flyvbjerg and Forrester.
4. **No separate cap needed:** weakest link already prevents stacking.
   Recommended next: carry the same sliding logic into cost uplift using the Green Book mitigation approach (start from the upper bound, reduce by mitigation factor).

### 12.4 Remaining open items

- Ryan: sign off on the two-ROI output (undiscounted and PV-based).
- Verify the secondary sources named in 12.2 before they appear in the writeup.
- Find 2-3 published cases beyond F5 (a whole Forrester study with all benefit and cost lines would let us test NPV and ROI end to end).
- Update the repo issues (#72, #74, #76, #79, #83, #84) with: preflight_gate, ask_user, confidence ledger, weakest link, two-ROI output.
