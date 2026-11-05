# Plan 04: Output (Ryan; Zihao for PDF storage)

Read `README.md` first. Issues: #65 O1, #66 O2, #67 O3, #68 O4, #69 O5, #70 O6, #71 O7 (stretch), #62 Z6. Q9 and Q11 are yours to confirm.

## Goal

A results experience and a report that read like a real pre-funding business case: the headline, the math behind it, the evidence behind each number, and what we could not quantify. The user chooses charts and structure, then downloads a PDF. **The UI never recomputes a number.** It reads the engine's result.

## What the research says a good report looks like

Read in full: **Forrester TEI study (Salesloft, 2022, 31 pages)** and **Vermont's IT Activity Business Case form instructions**. Both are vendor/government formats but they converge on the same core, and so do the UK five-case model and PMI benefits guidance (secondary).

Forrester TEI anatomy: executive summary with a headline box (ROI, benefits PV, NPV, payback) and a bar of benefits by category; context and assumptions; one section per benefit with a table (reference IDs A1.., source column: composite / assumption / interviews / formula, year 1-3), a **risk adjustment %**, risk-adjusted totals and PV, and a **"Risks" paragraph** saying what makes it vary; unquantified benefits and flexibility; costs in the same format; financial summary (cash-flow chart, ROI, NPV, payback, stated discount rate 10%); appendix with definitions.
Vermont form: business value by four types (financial, customer service, risk reduction, compliance), each with **how it will be measured**; risk of doing nothing vs risk of proceeding; current vs proposed lifecycle cost. Rule: labor savings count as dollars only if positions or overtime are actually eliminated; otherwise list freed time as a value, not a saving.

## Recommended report skeleton (O5)

1. Executive summary: headline box (both ROIs, NPV in hard and capacity-inclusive terms, payback), benefits-by-driver chart, one-paragraph "what this is".
2. Context and assumptions: what was entered and where it came from.
3. Benefits by driver: ref-ID table (value, source type, tier), haircut and confidence per driver, risks paragraph.
4. Costs (same format, with uplift shown).
5. Unquantified benefits and flexibility.
6. Financial summary: cash-flow chart, NPV, both ROIs, payback, discount rate stated.
7. Scenarios (conservative / expected / optimistic) and sensitivity.
8. Risks of doing nothing vs proceeding.
9. **Measurement plan**: per driver, the metric, baseline, how it will be measured after launch, owner, frequency (decided: include).
10. Appendix: formulas, sources, audit trail.
    Label the report a **pre-funding estimate**, with counts of inputs by tier (e.g. 5 measured, 2 documented, 3 benchmark).

## Data you read

The engine `Result` (shape in plan 03; fields: headline, drivers with ref-ID steps, costs, cash flows, scenarios, sensitivity, warnings, unquantified, proxies, overrides, flexibility, risks, confidence ledger) or a `GapList`. Never recompute; never edit a number. Stub results show a visible STUB label.

## Screens you own

- **Results (O4):** numbers tab, show-the-math view, charts tab. Mockup screens 06, 06a, 06b, 07 are ground truth; skip cut features.
- **Gap-list screen (new):** when the confidence gate fails there is no headline. Show the ranked list "what to add to get a result" with the confidence each item would reach, and a button back to intake with answers preserved (back and progress bar, O6). This is not an error state.
- **Report builder (O5):** choose charts from the fixed set (waterfall, driver contribution, sensitivity) and structure; download PDF. Charts are generated inside the PDF; agree the approach with Zihao (O2).
- **Edits (O7, stretch):** sliders on conservative / aggressive values only after O4-O6.

## Chart notes

- Waterfall shows gross, after adoption, after recapture, after haircut, adjusted (the engine's ordered steps).
- Driver contribution reconciles to the benefit total.
- Sensitivity: NPV across discount rates (Sprint 4 fixture: $9,417.48 at 3%, $8,181.82 at 10%).
- Show hard savings and capacity value distinctly everywhere; never add ROI, NPV, and payback together.

## What to display for confidence

Per driver: haircut, confidence, tier counts. Never show a precise-looking number without its backing summary. If a driver was dropped, show it under unquantified with the single item that would raise it.

## Test cases (O3, shared with Eli)

Find 2-3 published example cases. Best lead: a whole Forrester TEI study with all benefit and cost lines (the Salesloft benefit line already reproduces: $1,279,688 / $1,919,531 / $2,303,438 less 25% = $959,766 / $1,439,648 / $1,727,578; PV at 10% = $3,360,261). Compare within 10%. Note: Forrester ROI is NPV / PV of costs, so compare with `roi_pv`.

## Interfaces

- Eli / engine: `Result` and `GapList` shapes; thresholds.
- Zihao: `getLatestResult`, `saveReportPdf`, `getReportPdf`, PDF storage (Z6).
- Input team: the same driver and input names so the report can print "what was entered".

## Open questions

Q9 (confirm cuts: AI-requested charts, external software), Q11 (Edit Inputs use case with stretch sliders), single TEI-style risk % per driver shown alongside our haircut (optional), PDF chart generation approach.
