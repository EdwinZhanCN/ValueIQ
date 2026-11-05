# Plan 04: Output (Ryan; Zihao for PDF storage). Reads the engine output Eli builds

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

## Data you read: the engine's final output

Eli owns the engine and the assistant. When development is done, the engine returns exactly one **`RunOutput`** per run. It is either a **result** or a **gap list**, never both. You read it; you never recompute or edit a number. The only thing the UI does with a number is **format it** (currency to 2 decimals and percentages to 1 decimal, half-up, nothing else).

Until the real engine lands (Nov 8-10), the **stub returns this same shape** filled from the Sprint 4 fixture, with `meta.mode = "stub"`. Build against the stub first: your screens will not change when the real engine replaces it. Show a visible **STUB** label whenever `meta.mode === "stub"`.

### The type (the canonical copy moves to `shared/types.ts` once built; `ROI.md` section 7 is the design source)

```ts
type Tier = "measured" | "documented" | "benchmark" | "estimate" | "assumption";
type DriverId =
  "time_savings" | "data_quality" | "decision_speed" | "risk_reduction";
type LabelClass =
  | "hard_savings"
  | "capacity_value"
  | "avoided_loss"
  | "incremental_profit"
  | "customer_benefit";

interface RunOutput {
  kind: "result" | "gap_list";
  meta: Meta;
  result?: Result; // present when kind = "result"
  gap_list?: GapList; // present when kind = "gap_list"
}

interface Meta {
  run_id: string;
  mode: "real" | "stub"; // stub => show the STUB label
  label: "Pre-funding estimate";
  currency: string; // ISO code
  horizon_years: number;
  discount_rate_pct: number;
  scenario: "expected"; // the headline scenario
  tier_counts: Record<Tier, number>; // "5 measured, 2 documented, 3 benchmark ..."
  contract_version: string;
  formula_version: string;
  settings_version: string;
  generated_at: string; // ISO
}

interface Result {
  headline: Headline;
  drivers: Driver[]; // included drivers
  costs: Costs;
  cash_flows: CashFlowRow[];
  scenarios: Record<
    "conservative" | "expected" | "optimistic",
    ScenarioSummary
  >;
  sensitivity: {
    discount_rate: SensPoint[];
    adoption: SensPoint[];
    haircut: SensPoint[];
  };
  charts: Charts; // data for the fixed chart set, precomputed
  confidence: ConfidenceLedger;
  narrative: Narrative; // text only; every number in it cites a step ref
  unquantified: Unquantified[]; // dropped or excluded benefits, with the one fix
  flexibility: string[];
  doing_nothing_risks: string[];
  proceeding_risks: string[];
  measurement_plan: Record<DriverId, MeasurementPlan>;
  proxies_used: ProxyUsed[]; // defaults the user accepted, with source and tier
  overrides: Override[]; // computed value kept next to the override
  warnings: Warning[]; // guardrails (see below)
}

interface Headline {
  npv: { hard: number | null; capacity_inclusive: number | null };
  roi: {
    undiscounted: { hard: number | null; capacity_inclusive: number | null }; // Sprint 4 spec
    pv: { hard: number | null; capacity_inclusive: number | null }; // NPV / PV(costs), Forrester style
  };
  payback: { hard: Payback; capacity_inclusive: Payback };
  benefits_pv: number | null;
  costs_pv: number | null;
  null_reasons: Record<string, string>; // why a field is null (e.g. zero cost => ROI undefined)
}
type Payback = { years: number | null; text: string }; // years null => "No payback within the selected horizon"

interface Driver {
  id: DriverId;
  label_class: LabelClass;
  steps: Step[]; // ordered: gross, adoption, recapture, haircut
  annual: { year: number; benefit: number }[];
  haircut_pct: number; // effective, weakest link
  confidence: number; // 0-1, equals 1 - haircut
  tier_counts: Record<Tier, number>;
  total: number;
  pv: number;
  share_of_benefit: number; // 0-1
  measured_by: string; // how achievement will be verified
  risk_factors: string[]; // what makes this vary (TEI "Risks" paragraph)
}

interface Step {
  ref: string; // "A1", "A2"... shown in the UI and cited by the narrative
  order: number;
  name: "gross" | "adoption" | "recapture" | "haircut" | "adjusted" | string;
  formula: string; // human-readable
  inputs: { id: string; label: string; value: number | string }[];
  source_type: "user" | "file" | "default" | "proxy" | "calculated";
  value: number;
  evidence_tier: Tier | null;
}

interface Costs {
  lines: {
    id: string;
    label: string;
    base: number;
    basis: "quoted" | "estimated" | "assumed";
    uplift_pct: number;
    adjusted: number;
    ref: string;
  }[];
  total_pv: number;
  delay_months: number;
}

interface CashFlowRow {
  year: number;
  benefits_hard: number;
  benefits_capacity: number;
  costs: number;
  net: number;
  cumulative: number;
}

interface ScenarioSummary {
  npv_hard: number | null;
  npv_capacity_inclusive: number | null;
  roi_pv_capacity_inclusive: number | null;
  what_moved: string;
}

interface SensPoint {
  x: number; // discount rate, adoption or haircut value
  npv_hard: number | null;
  npv_capacity_inclusive: number | null;
}

interface Charts {
  // plot these as given; do not derive them
  waterfall: { label: string; value: number }[]; // gross -> adopted -> recaptured -> haircut -> adjusted
  driver_contribution: { driver: DriverId; value: number }[]; // reconciles to the benefit total
  sensitivity: SensPoint[]; // NPV across discount rates (fixture: $9,417.48 at 3%, $8,181.82 at 10%)
}

interface ConfidenceLedger {
  integrity: { passed: boolean; checks: { name: string; passed: boolean }[] };
  drivers: {
    id: DriverId;
    confidence: number;
    floor: number;
    included: boolean;
  }[];
  project: { confidence: number; floor: number; capped_by?: DriverId };
  band_note: string; // plain-language backing summary shown next to the headline
}

interface Narrative {
  summary: string; // text only, step refs in brackets
  by_driver: Record<DriverId, string>;
}
interface Unquantified {
  target: string;
  reason: string;
  raise_with: string; // e.g. "attach the incident log"
}
interface MeasurementPlan {
  metric: string;
  baseline: string;
  baseline_source: string;
  owner: string;
  frequency: string;
}
interface ProxyUsed {
  input_id: string;
  value: number | string;
  source: string;
  tier: Tier;
}
interface Override {
  path: string;
  computed_value: number;
  override_value: number;
  reason: string;
  author: string;
  at: string;
}
interface Warning {
  code: string;
  message: string;
  refs: string[];
}

interface GapList {
  reason: string; // "Not enough backed evidence to give a result"
  project_confidence: number;
  project_floor: number;
  items: {
    rank: number; // ordered by how much each raises confidence
    target: string; // input or driver id
    label: string; // plain words
    what_to_add: string; // "Attach the incident log"
    confidence_now: number;
    confidence_if_added: number;
    return_to: { screen: "intake"; input_id: string }; // deep link back, answers kept
  }[];
  dropped_drivers: { id: DriverId; confidence: number; floor: number }[];
}
```

### Sample (stub, abridged)

```json
{
  "kind": "result",
  "meta": {
    "run_id": "run_stub_1",
    "mode": "stub",
    "label": "Pre-funding estimate",
    "currency": "USD",
    "horizon_years": 1,
    "discount_rate_pct": 10,
    "scenario": "expected",
    "tier_counts": {
      "measured": 0,
      "documented": 3,
      "benchmark": 2,
      "estimate": 0,
      "assumption": 0
    },
    "contract_version": "1",
    "formula_version": "0.1",
    "settings_version": "s1",
    "generated_at": "2026-11-07T12:00:00Z"
  },
  "result": {
    "headline": {
      "npv": { "hard": null, "capacity_inclusive": 8181.82 },
      "roi": {
        "undiscounted": { "hard": null, "capacity_inclusive": null },
        "pv": { "hard": null, "capacity_inclusive": null }
      },
      "payback": {
        "hard": {
          "years": null,
          "text": "No payback within the selected horizon"
        },
        "capacity_inclusive": { "years": 0.5, "text": "6 months" }
      },
      "benefits_pv": 18181.82,
      "costs_pv": 10000,
      "null_reasons": { "npv.hard": "No documented cash reduction" }
    },
    "drivers": [
      {
        "id": "time_savings",
        "label_class": "capacity_value",
        "haircut_pct": 20,
        "confidence": 0.8,
        "total": 20000,
        "share_of_benefit": 1,
        "steps": [
          {
            "ref": "A1",
            "order": 1,
            "name": "gross",
            "formula": "staff x hours x weeks x rate",
            "value": 100000,
            "source_type": "user",
            "evidence_tier": "documented",
            "inputs": []
          }
        ]
      }
    ],
    "charts": {
      "waterfall": [
        { "label": "Gross", "value": 100000 },
        { "label": "After adoption", "value": 50000 },
        { "label": "After recapture", "value": 25000 },
        { "label": "After haircut", "value": 20000 }
      ]
    },
    "confidence": {
      "integrity": { "passed": true, "checks": [] },
      "project": { "confidence": 0.8, "floor": 0.85 },
      "drivers": [],
      "band_note": "2 documented, 1 benchmark input"
    }
  }
}
```

The stub values are illustrative. The real engine's numbers come from the same fixture ($100,000 gross, $20,000 adjusted, NPV $8,181.82 at 10% and $9,417.48 at 3%). Treat the field names and nesting as the contract, not these values.

### What every screen reads

| Screen or report part                | Fields                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| STUB / pre-funding label             | `meta.mode`, `meta.label`, `meta.tier_counts`                                                         |
| Headline box                         | `headline` (both ROIs labeled, hard and capacity-inclusive NPV, payback text), `confidence.band_note` |
| Benefits by driver table             | `drivers[]` (ref ids, source type, tier, `haircut_pct`, `confidence`, `risk_factors`)                 |
| Show the math                        | `drivers[].steps[]` (ref, formula, inputs, value); `costs.lines[]`                                    |
| Charts tab and PDF charts            | `charts.waterfall`, `charts.driver_contribution`, `charts.sensitivity` (plot as given)                |
| Scenarios and sensitivity            | `scenarios`, `sensitivity`                                                                            |
| Unquantified and flexibility         | `unquantified`, `flexibility`                                                                         |
| Risks of doing nothing vs proceeding | `doing_nothing_risks`, `proceeding_risks`                                                             |
| Measurement plan section             | `measurement_plan`                                                                                    |
| Assumptions and appendix             | `proxies_used`, `overrides`, `warnings`, `meta` versions, `confidence` ledger                         |
| Summary paragraph                    | `narrative.summary` (cites step refs; render the refs as links to Show the math)                      |
| Gap-list screen                      | `gap_list` (ranked items, `return_to` deep link)                                                      |

### Rules for the output UI

- **Both ROIs, always labeled.** Show `roi.undiscounted` ("ROI, undiscounted, Sprint 4 definition") and `roi.pv` ("ROI, NPV / PV of costs, comparable to published business cases"). Never show a bare "ROI". Never add ROI, NPV and payback together.
- **Hard and capacity-inclusive are always side by side.** Hard savings are the documented cash; capacity value is freed time. Never merge them into one number.
- **Null is not zero.** If a headline field is `null`, show the matching `null_reasons` text, not 0 or a blank.
- **No headline without backing.** Wherever a headline number appears, show `confidence.band_note` and the tier counts next to it.
- **Guardrail warnings** (`warnings[]`): one driver over 50% of benefit; over 50% from vendor-supplied numbers; the same hours or events in two drivers; NPV sign flips within 3 points of the discount rate; assumption-tier inputs over 25% of benefit. Show them as notices on the results page and in the report appendix.
- **Overrides** (stretch O7): show the computed value next to the override with reason, author and time; the engine keeps both.
- **Versioned contract:** ignore unknown keys; if `meta.contract_version` is one you do not know, fail visibly rather than silently.

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

- Eli (engine and assistant, sole owner): the `RunOutput` type above is the contract. Ask Eli before you need a field that is not in it; do not derive numbers in the UI. The stub returns this shape from day one.
- Zihao: `getLatestResult`, `saveReportPdf`, `getReportPdf`, PDF storage (Z6).
- Input team: the same driver and input names so the report can print "what was entered".

## Open questions

Q9 (confirm cuts: AI-requested charts, external software), Q11 (Edit Inputs use case with stretch sliders), single TEI-style risk % per driver shown alongside our haircut (optional), PDF chart generation approach.
