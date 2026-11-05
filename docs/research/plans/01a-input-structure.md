# Input structure by project type (handoff to the input team)

Companion to `01-input-team.md`. Read `README.md` first.

I2/I3 follow-up (Nov 5): the [v1 handoff proposal](input-contract-v1.md) supplements these field tables with a complete envelope, conditional requirement paths, source metadata, file-group projection and typed examples. Its `contract_version` and additional fields require Eli/Zihao review before adoption; the skeleton in section 8 remains historical research context. No engine IDs are replaced by this proposal.

**Alignment rule (important).** The calculation engine is built in parallel from `ROI.md` section 3 (input ids) and section 4 (formulas). **The field ids, units and bounds below are copied from there. If this file and `ROI.md` ever disagree, `ROI.md` wins** and this file is wrong: open a PR on both. You (Jonathan, Jeremiah) own wording, order, grouping and defaults' presentation. Renaming an id, changing a unit, or adding a field the engine reads means telling Eli first (sole owner of the engine and assistant).

## 1. How the engine uses a field

The engine (a pure TypeScript library, no I/O, plan 03) reads one JSON form file. Per driver it computes in this order: gross, adoption, recapture (capacity only), **haircut**, cost uplift and delay, discounting. That gives every field one of four roles:

| Role      | Meaning                                                                                                                                                                | Haircut? | Backing asked?            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------- |
| `effect`  | The change the project causes, or the money value of that change. **Its tier sets the haircut.** Driver haircut = max over its effect inputs; driver confidence = min. | **yes**  | **yes**, in the same card |
| `known`   | A count, rate or setting the user simply knows (staff, weeks, hourly cost, adoption ramp). Validated, tier recorded, no haircut.                                       | no       | tier only                 |
| `cost`    | Enters costs. A cost basis (quoted / estimated / assumed) sets the uplift 15 / 30 / 50%. No haircut.                                                                   | no       | basis only                |
| `context` | Text or files. Never enters a formula.                                                                                                                                 | no       | no                        |

Required level: **E** essential (engine cannot compute; missing essential cost blocks the headline), **R** recommended (raises confidence), **O** optional.

## 2. The input record the engine reads

```ts
type Tier =
  | "measured"
  | "documented"
  | "benchmark"
  | "estimate"
  | "assumption"
  | "user_unknown";

interface Input {
  id: string; // from ROI.md section 3, never invented here
  value: number | string | null; // null = unknown. Unknown is never stored as 0
  unit: string; // currency, hours, minutes, count, percent, days, months, fte
  period?: "per_year" | "per_week" | "per_event" | "one_time";
  low?: number;
  high?: number; // range; feeds the "tight range" check
  tier: Tier;
  origin: "user" | "file" | "default" | "proxy_accepted" | "assistant_accepted";
  basis?: "quoted" | "estimated" | "assumed"; // COST inputs only (sets the uplift)
  backing?: Backing; // effect inputs only
  note?: string;
}

// The engine turns these six checks into the backing score b (weights .25/.20/.20/.10/.15/.10).
// Each check needs a machine-readable field, not free text:
interface Backing {
  source_file_id?: string; // check 1 (.25). Must belong to the same project
  quote?: string; // passage the assistant found
  quote_confirmed?: boolean; // user tapped confirm. Required with a file for tier "measured"
  second_source_value?: number; // check 2 (.20): second independent figure; engine tests within 20%
  second_source_note?: string; // where it came from (display only)
  observations?: number; // check 3 (.20): n >= 30, or...
  period_months?: number; //   ...at least one full business cycle (>= 12 months)
  source_date?: string; // check 4 (.10): ISO date; newer than 12 months
  verified?: boolean; // check 6 (.10): reviewed by the data owner or reviewer
  verified_by?: string;
} // check 5 (.15, tight range) comes from low/high on the Input
```

**Do not ask the user for tiers or weights.** Map plain answers to a tier:

| User says                                                                                                                   | Tier                                          |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| "From a system report or file I attached" (needs file **and** confirmed quote)                                              | `measured`                                    |
| "From a contract, SLA, audit or written source about us"                                                                    | `documented`                                  |
| "Industry figure for the same kind of work" (like-for-like only)                                                            | `benchmark`                                   |
| "My best estimate"                                                                                                          | `estimate`                                    |
| "Not sure, use the default"                                                                                                 | the default's own tier, shown with its source |
| Typed or self-reported **time savings are never `measured`** (self-reports run high; METR, Humlum in `haircutResearch.md`). |

**Rules for every field**

- Percentages 0-100. Hours, counts, costs >= 0. Counts are integers. Horizon integer 1-20. Delay integer 0-240 months. Cost uplift 0-1000%.
- "Not sure" offers two choices: **use the labeled default** or **exclude** (listed as unquantified, never zero).
- Every default has a source and tier. No source means `team assumption`. Defaults are shown to the user, never silent.
- An assistant suggestion is not used until the user accepts it.

## 3. Common block (all goals)

| id                   | Label                                                                                            | Role    | Unit      | Level | Default (source, tier)                                          | Bounds                                   |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------- | --------- | ----- | --------------------------------------------------------------- | ---------------------------------------- |
| `project_name`       | Project name                                                                                     | context | text      | E     | none                                                            | 1-120 chars                              |
| `decision_statement` | The "should we fund X" sentence                                                                  | context | text      | E     | none                                                            | 1-500 chars                              |
| `goals[]`            | Goals that apply (any combination)                                                               | context | enum list | E     | none                                                            | at least 1                               |
| `currency`           | Currency (one per project)                                                                       | known   | ISO code  | E     | USD                                                             | ISO                                      |
| `horizon_years`      | Years to evaluate                                                                                | known   | int       | E     | **3** (matches Priya and Nucleus practice; **team assumption**) | 1-20                                     |
| `discount_rate_pct`  | Discount rate                                                                                    | known   | percent   | E     | **10** (Forrester TEI; orgs typically 8-16; `benchmark`)        | 0-100                                    |
| `adoption_by_year[]` | Share of intended users actually using it, one value per year of the horizon (e.g. 50 / 85 / 90) | known   | percent   | E     | none (ask)                                                      | 0-100 each                               |
| `other_notes`        | Anything we did not ask?                                                                         | context | text      | O     | none                                                            | assistant turns it into proposed caveats |
| `files[]`            | Project description (pdf/md/docx); data files each with a **required** description               | context | file      | R / O | none                                                            | size caps TBD (Q7)                       |

### Costs (all goals)

Each cost line is an `Input` with `role: cost` and its own `basis`. The engine multiplies each line by `1 + uplift`: quoted 15%, estimated 30%, assumed 50% (team judgment; Forrester TEI 10-15%, Flyvbjerg and Budzier 27% mean IT overrun).

| id                             | Label                                                       | Unit                     | Level |
| ------------------------------ | ----------------------------------------------------------- | ------------------------ | ----- |
| `cost_one_time_vendor_license` | Vendor, license, integration, data migration (one-time)     | currency                 | E     |
| `cost_one_time_internal_labor` | Internal labor to build and roll out                        | FTE-months x loaded rate | R     |
| `cost_training_change`         | Training and change management                              | currency                 | R     |
| `cost_annual_run`              | Annual run cost (hosting, license, usage)                   | currency / yr            | E     |
| `cost_annual_internal_support` | Annual internal support                                     | FTE x rate               | R     |
| `cost_uplift_pct`              | Override of the uplift (leave blank to derive from `basis`) | percent                  | O     |
| `delay_months`                 | Months until benefits start                                 | int                      | R     |
| `baseline_alternative`         | What doing nothing costs (text + currency)                  | text + currency          | R     |

## 4. Goal modules (ask only the goals selected; shared inputs asked once)

### 4.1 Time savings (capacity value; hard only with documented cash)

`hours_saved_week = staff_affected x (minutes_per_task_before - minutes_per_task_after) x tasks_per_staff_week / 60` (or entered directly)
`gross_t = hours_saved_week x weeks_per_year x loaded_hourly_cost`
`adj_t = gross_t x adoption_t x recapture_pct x (1 - H)` -> **estimated capacity value**
`hard_t = realized_as_cash x (1 - H)` only when documented -> **hard savings**

| id                                                                                                                       | Label                                                              | Role       | Unit          | Level | Default                                                                         | Bounds / notes                       |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------- | ------------- | ----- | ------------------------------------------------------------------------------- | ------------------------------------ |
| `staff_affected`                                                                                                         | People affected                                                    | known      | int           | E     | none                                                                            | >= 1                                 |
| `minutes_per_task_before`                                                                                                | Minutes per task today                                             | **effect** | min           | E     | none                                                                            | > 0                                  |
| `minutes_per_task_after`                                                                                                 | Minutes per task with the project                                  | **effect** | min           | E     | none                                                                            | 0 <= after < before                  |
| `hours_saved_per_staff_week`                                                                                             | Alternative: hours saved per person per week                       | **effect** | hours         | O     | none                                                                            | use instead of the two minute fields |
| `tasks_per_staff_week`                                                                                                   | Tasks per person per week                                          | known      | count         | E     | none                                                                            | >= 0                                 |
| `weeks_per_year`                                                                                                         | Working weeks per year                                             | known      | weeks         | R     | 48 (Priya / Sprint 1 example; **team assumption**)                              | 1-52                                 |
| `loaded_hourly_cost`                                                                                                     | Loaded hourly cost                                                 | known      | currency / h  | E     | salary x 1.35 if only salary is known (S5; `assumption`)                        | > 0                                  |
| `recapture_pct`                                                                                                          | Share of freed time turned into useful work                        | known      | percent       | R     | **50** (Nucleus productivity factor; `benchmark`; sales 70-90, marketing <= 50) | 0-100                                |
| `realized_as_cash`                                                                                                       | Documented cash reduction (positions or overtime actually removed) | **effect** | currency / yr | O     | blank = none                                                                    | only this counts as **hard**         |
| Backing prompts: time sample or system log (file), period and sample size, second source. Self-report only = `estimate`. |

### 4.2 Data quality (avoided cost; hard if cash cost, else capacity)

`avoided_events = events_before - events_after` (or rate x volume)
`benefit_t = avoided_events x cost_per_error x adoption_t x (1 - H)`; if only the unit cost is known, `cost_per_error = cost_per_clean_unit x (error_cost_multiplier - 1)`.

| id                                                                   | Label                                                      | Role       | Unit      | Level | Default                      | Notes                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | ---------- | --------- | ----- | ---------------------------- | ---------------------------------------------------- |
| `records_or_events_per_year`                                         | Records or events per year                                 | known      | count     | E     | none                         | integer                                              |
| `error_rate_before` / `error_rate_after`                             | Error rate today / with the project                        | **effect** | percent   | E     | none                         | 0-100; after <= before                               |
| `error_count_before` / `error_count_after`                           | Alternative: error counts per year                         | **effect** | count     | O     | none                         | use instead of rates (Priya: 72 to 24)               |
| `cost_per_error`                                                     | Cost of one error                                          | **effect** | currency  | E     | none                         | Priya: $690 per expedited shipment                   |
| `cost_per_clean_unit`                                                | Cost of one clean unit                                     | known      | currency  | O     | none                         | with the multiplier when `cost_per_error` is unknown |
| `error_cost_multiplier`                                              | Rule of Ten multiplier                                     | known      | x         | O     | **10** (Redman; `benchmark`) | >= 1                                                 |
| `stages_downstream`                                                  | Stages that re-handle a bad record                         | known      | int       | O     | none                         |                                                      |
| `cost_sources[]`                                                     | Which costs: rework, escalation, expedite, customer credit | context    | enum list | R     | none                         | double-count check against time savings              |
| Backing prompts: error log or QA report (file), period, sample size. |

### 4.3 Decision speed (time value, labeled by basis)

`benefit_t = decisions_per_year x (days_to_decide_before - days_to_decide_after) x cost_of_delay_per_day x adoption_t x (1 - H)`

| id                      | Label                                                                 | Role       | Unit           | Level | Default                | Notes                                                 |
| ----------------------- | --------------------------------------------------------------------- | ---------- | -------------- | ----- | ---------------------- | ----------------------------------------------------- |
| `decisions_per_year`    | Decisions of this kind per year                                       | known      | count          | E     | none                   | integer                                               |
| `days_to_decide_before` | Days to decide today                                                  | **effect** | days           | E     | none                   | > 0                                                   |
| `days_to_decide_after`  | Days to decide with the project                                       | **effect** | days           | E     | none                   | 0 <= after < before                                   |
| `cost_of_delay_per_day` | What one day of delay costs                                           | **effect** | currency / day | E     | **none, never invent** | hardest input; warn when tier is `estimate` or weaker |
| `cost_of_delay_basis`   | revenue deferred / cost continuing / risk exposure / opportunity lost | context    | enum           | E     | none                   | sets the label                                        |
| `example_decision`      | A dated example decision                                              | context    | text           | R     | none                   | goal-specific required backing (ROI.md 12.2)          |

### 4.4 Risk reduction (avoided loss; customer-borne separate)

`ALE_before = aro_before x SLE; ALE_after = aro_after x SLE; benefit_t = (ALE_before - ALE_after) x adoption_t x (1 - H)`

| id                                                                                     | Label                                    | Role       | Unit              | Level | Default      | Notes                                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- | ----------------- | ----- | ------------ | ----------------------------------------------------------- |
| `event_type`                                                                           | What kind of event                       | context    | text              | E     | none         | e.g. sustained outage                                       |
| `aro_before` / `aro_after`                                                             | Events per year today / with the project | **effect** | events / yr       | E     | none         | fractions allowed (0.25 = once in 4 years); after <= before |
| `loss_per_event`                                                                       | Loss per event (SLE)                     | **effect** | currency          | E     | none         | or asset value x exposure                                   |
| `asset_value`, `exposure_factor_pct`                                                   | Alternative to `loss_per_event`          | **effect** | currency, percent | O     | none         | 0-100                                                       |
| `cost_bearer`                                                                          | organization / customer / third party    | context    | enum              | E     | organization | customer-borne reported separately                          |
| Goal-specific required backing: a range (low and high) and a loss basis (ROI.md 12.2). |

## 5. Measurement plan (per selected goal; the report prints it)

Engine ids are not defined yet in `ROI.md` section 3. **Decided by Eli (Nov 5):** `measurement_plan.<goal>.{metric, baseline, baseline_source, owner, frequency}` where `metric` is before/after, survey, audit or system report. Not on the demo critical path for the engine, but the assistant proposes it and the report prints it.

## 6. Card layout

One card per missing or weak input, max 4 fields: plain-language question with unit and period; value (plus optional low/high); **Confirm / Not sure / Use labeled default / Exclude**; backing chips (source file, period and sample, second source value, date, verified) pre-filled when the assistant found a file passage; a tier badge that updates as backing is added. Ask backing only for `effect` inputs (plus cost basis for costs), matching the engine.

## 7. Cross-goal checks

| Check            | Rule                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Double counting  | Same hours or events under two goals: warn and ask which counts (data-quality rework hours vs time savings). The engine also warns. |
| Bounds           | Reject at entry and keep the previous accepted value (Priya's 105% adoption).                                                       |
| Hard vs capacity | A saving is hard only with `realized_as_cash` documented.                                                                           |
| Excluded items   | Listed as unquantified, with the one item that would bring them in.                                                                 |
| Files            | `source_file_id` must belong to this project; the engine rejects other ids.                                                         |
| Unknown          | `null` plus reason; never 0.                                                                                                        |

## 8. Form file skeleton

```json
{
  "version": 1,
  "goals": ["time_savings"],
  "currency": "USD",
  "horizon_years": 3,
  "discount_rate_pct": 10,
  "inputs": [
    {
      "id": "minutes_per_task_before",
      "value": 30,
      "unit": "min",
      "tier": "measured",
      "origin": "file",
      "backing": {
        "source_file_id": "file_123",
        "quote": "avg handle time 30 min",
        "quote_confirmed": true,
        "observations": 400,
        "period_months": 12,
        "source_date": "2026-09-30",
        "verified": true
      }
    },
    {
      "id": "cost_one_time_vendor_license",
      "value": 40000,
      "unit": "USD",
      "tier": "documented",
      "basis": "quoted",
      "origin": "user"
    }
  ],
  "file_descriptions": { "file_123": "Q3 ops handle-time export" },
  "other_notes": "",
  "measurement_plan": {},
  "asked": ["minutes_per_task_before"]
}
```

Stored opaquely by Zihao (`project_forms.form_json`). The assistant edits this file and never creates numbers.

## 9. Test values to build against (engine tests use the same)

- Sprint 4: 10 staff x 5 hours x 40 weeks x $50 = $100,000; adoption 50%, recapture 50%, haircut 20% gives $20,000 (NPV $8,181.82 at 10%, $9,417.48 at 3%).
- Rule of Ten: 62 x $1 + 38 x $10 = $442. ALE: 3 x ($100,000 x 25%) = $75,000.
- Priya (Sprint 1): realistic form values. Her published headline does not match her own components, so use it for form examples only.

## 10. Decisions (engine side decided by Eli, Nov 5; input side yours)

1. **Value-per-unit inputs as effect inputs:** `cost_per_error`, `cost_of_delay_per_day`, `loss_per_event` are marked `effect` here (uncertain, so they carry a haircut and backing). ROI.md names only the change inputs (hours, errors, days, ARO). Decided: they stay `effect`.
2. **Cost basis per line:** proposed `basis` on each cost input (engine derives the uplift). ROI.md currently has one `cost_uplift_pct`.
3. **Structured backing fields** in section 2 (second source value, observations, period months, source date, verified) are needed for the six checks; ROI.md 3.7 names the checks but not the fields.
4. **Defaults:** one table, shared by the form and the engine's `get_defaults`. Zihao decides where it lives (team goals vs hardcoded).
5. **Measurement plan ids** (section 5).
6. Upload limits (Q7, Eli); exact E / R / O split per goal combination (input team).
