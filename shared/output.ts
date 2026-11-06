/** Version 1 consumer contract from the engine owner's PR #123 samples.
 * Values are validated, never calculated or repaired here. Unknown keys are
 * ignored so additive engine fields do not become client/server coupling.
 */
type Parser<T> = (value: unknown) => T;
const fail = (): never => {
  throw new Error("ENGINE_INTEGRITY: invalid version 1 engine output");
};
const string: Parser<string> = (value) =>
  typeof value === "string" && value.length <= 16384 ? value : fail();
const number: Parser<number> = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : fail();
const count: Parser<number> = (value) => {
  const n = number(value);
  return Number.isInteger(n) && n >= 0 ? n : fail();
};
const ratio: Parser<number> = (value) => {
  const n = number(value);
  return n >= 0 && n <= 1 ? n : fail();
};
const boolean: Parser<boolean> = (value) =>
  typeof value === "boolean" ? value : fail();
const choice =
  <const T extends readonly string[]>(values: T): Parser<T[number]> =>
  (value) =>
    typeof value === "string" && values.includes(value) ? value : fail();
const nullable =
  <T>(parse: Parser<T>): Parser<T | null> =>
  (value) =>
    value === null ? null : parse(value);
const optional =
  <T>(parse: Parser<T>): Parser<T | undefined> =>
  (value) =>
    value === undefined ? undefined : parse(value);
const array =
  <T>(parse: Parser<T>): Parser<T[]> =>
  (value) =>
    Array.isArray(value) && value.length <= 2000
      ? value.map((item) => parse(item))
      : fail();
const dictionary =
  <T>(parse: Parser<T>): Parser<Record<string, T>> =>
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return fail();
    const entries = Object.entries(value);
    if (entries.length > 1000) return fail();
    return Object.fromEntries(entries.map(([key, item]) => [key, parse(item)]));
  };
const object =
  <S extends Record<string, Parser<unknown>>>(
    shape: S,
  ): Parser<{ [K in keyof S]: ReturnType<S[K]> }> =>
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return fail();
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(shape).map(([key, parse]) => [key, parse(record[key])]),
    ) as { [K in keyof S]: ReturnType<S[K]> };
  };
const numericOrText: Parser<number | string> = (value) =>
  typeof value === "number" ? number(value) : string(value);
const tier = choice([
  "measured",
  "documented",
  "benchmark",
  "estimate",
  "assumption",
]);
const driverId = choice([
  "time_savings",
  "data_quality",
  "decision_speed",
  "risk_reduction",
]);
const tiers = object({
  measured: count,
  documented: count,
  benchmark: count,
  estimate: count,
  assumption: count,
});
const meta = object({
  run_id: string,
  mode: choice(["real", "stub"]),
  label: choice(["Pre-funding estimate"]),
  currency: string,
  horizon_years: count,
  discount_rate_pct: number,
  scenario: choice(["expected"]),
  tier_counts: tiers,
  contract_version: choice(["1"]),
  formula_version: string,
  settings_version: string,
  generated_at: string,
});
const point = object({
  x: number,
  npv_hard: nullable(number),
  npv_capacity_inclusive: nullable(number),
});
const step = object({
  ref: string,
  order: count,
  name: string,
  label: string,
  formula: string,
  inputs: array(object({ id: string, label: string, value: numericOrText })),
  source_type: choice(["user", "file", "default", "proxy", "calculated"]),
  value: number,
  by_year: array(number),
  evidence_tier: nullable(tier),
});
const driver = object({
  id: driverId,
  label_class: choice([
    "hard_savings",
    "capacity_value",
    "avoided_loss",
    "incremental_profit",
    "customer_benefit",
  ]),
  label: string,
  included: boolean,
  steps: array(step),
  annual: array(object({ year: count, benefit: number })),
  haircut_pct: number,
  confidence: ratio,
  tier_counts: tiers,
  total: number,
  pv: number,
  share_of_benefit: ratio,
  measured_by: string,
  risk_factors: array(string),
});
const headlineBasis = object({
  hard: nullable(number),
  capacity_inclusive: nullable(number),
});
const payback = object({ years: nullable(number), text: string });
const scenario = object({
  npv_hard: nullable(number),
  npv_capacity_inclusive: nullable(number),
  roi_pv_capacity_inclusive: nullable(number),
  what_moved: string,
});
const result = object({
  headline: object({
    npv: headlineBasis,
    roi: object({ undiscounted: headlineBasis, pv: headlineBasis }),
    payback: object({ hard: payback, capacity_inclusive: payback }),
    benefits_pv: nullable(number),
    costs_pv: nullable(number),
    null_reasons: dictionary(string),
  }),
  drivers: array(driver),
  costs: object({
    lines: array(
      object({
        id: string,
        label: string,
        base: number,
        basis: choice(["quoted", "estimated", "assumed"]),
        uplift_pct: number,
        adjusted: number,
        ref: string,
      }),
    ),
    total_pv: number,
    delay_months: number,
  }),
  cash_flows: array(
    object({
      year: count,
      benefits_hard: number,
      benefits_capacity: number,
      costs: number,
      net: number,
      cumulative: number,
    }),
  ),
  scenarios: object({
    conservative: scenario,
    expected: scenario,
    optimistic: scenario,
  }),
  sensitivity: object({
    x_labels: object({
      discount_rate: string,
      adoption: string,
      haircut: string,
    }),
    discount_rate: array(point),
    adoption: array(point),
    haircut: array(point),
  }),
  charts: object({
    waterfall: array(object({ label: string, value: number })),
    driver_contribution: array(object({ driver: driverId, value: number })),
    sensitivity: array(point),
  }),
  confidence: object({
    integrity: object({
      passed: boolean,
      checks: array(object({ name: string, passed: boolean })),
    }),
    drivers: array(
      object({
        id: driverId,
        confidence: ratio,
        floor: ratio,
        included: boolean,
      }),
    ),
    project: object({
      confidence: ratio,
      floor: ratio,
      capped_by: optional(driverId),
    }),
    band_note: string,
  }),
  narrative: object({ summary: string, by_driver: dictionary(string) }),
  unquantified: array(
    object({ target: string, reason: string, raise_with: string }),
  ),
  flexibility: array(string),
  doing_nothing_risks: array(string),
  proceeding_risks: array(string),
  measurement_plan: dictionary(
    object({
      metric: string,
      baseline: string,
      baseline_source: string,
      owner: string,
      frequency: string,
    }),
  ),
  proxies_used: array(
    object({ input_id: string, value: numericOrText, source: string, tier }),
  ),
  overrides: array(
    object({
      path: string,
      computed_value: number,
      override_value: number,
      reason: string,
      author: string,
      at: string,
    }),
  ),
  warnings: array(
    object({ code: string, message: string, refs: array(string) }),
  ),
});
const gapList = object({
  reason: string,
  project_confidence: ratio,
  project_floor: ratio,
  items: array(
    object({
      rank: count,
      target: string,
      label: string,
      what_to_add: string,
      confidence_now: ratio,
      confidence_if_added: ratio,
      return_to: object({ screen: choice(["intake"]), input_id: string }),
    }),
  ),
  dropped_drivers: array(
    object({ id: driverId, confidence: ratio, floor: ratio }),
  ),
});
export type OutputMeta = ReturnType<typeof meta>;
export type EngineResult = ReturnType<typeof result>;
export type ResultOutput = {
  kind: "result";
  meta: OutputMeta;
  result: EngineResult;
};
export type GapOutput = {
  kind: "gap_list";
  meta: OutputMeta;
  gap_list: ReturnType<typeof gapList>;
};
export type RunOutput = ResultOutput | GapOutput;

export function parseRunOutput(value: unknown): RunOutput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const record = value as Record<string, unknown>;
  const metadata = meta(record.meta);
  if (
    !/^[\w-]{1,128}$/.test(metadata.run_id) ||
    !/^[A-Z]{3}$/.test(metadata.currency) ||
    metadata.horizon_years < 1 ||
    metadata.horizon_years > 20 ||
    !Number.isFinite(Date.parse(metadata.generated_at))
  )
    return fail();
  if (record.kind === "result" && record.gap_list === undefined) {
    const parsed = result(record.result),
      ledger = parsed.confidence;
    // Check the declared release outcome; do not rerun the confidence formula.
    if (
      !ledger.integrity.passed ||
      ledger.integrity.checks.some((c) => !c.passed) ||
      ledger.project.confidence < ledger.project.floor ||
      ledger.drivers.some((d) => d.included && d.confidence < d.floor)
    )
      return fail();
    if (
      parsed.drivers.some((d) =>
        d.steps.some((s) => s.by_year.length !== metadata.horizon_years),
      )
    )
      return fail();
    const fields: Record<string, number | null> = {
      "npv.hard": parsed.headline.npv.hard,
      "npv.capacity_inclusive": parsed.headline.npv.capacity_inclusive,
      "roi.undiscounted.hard": parsed.headline.roi.undiscounted.hard,
      "roi.undiscounted.capacity_inclusive":
        parsed.headline.roi.undiscounted.capacity_inclusive,
      "roi.pv.hard": parsed.headline.roi.pv.hard,
      "roi.pv.capacity_inclusive": parsed.headline.roi.pv.capacity_inclusive,
      benefits_pv: parsed.headline.benefits_pv,
      costs_pv: parsed.headline.costs_pv,
    };
    if (
      Object.entries(fields).some(
        ([key, n]) => n === null && !parsed.headline.null_reasons[key]?.trim(),
      )
    )
      return fail();
    return { kind: "result", meta: metadata, result: parsed };
  }
  if (record.kind === "gap_list" && record.result === undefined) {
    const parsed = gapList(record.gap_list);
    if (
      parsed.items.some(
        (item, i) =>
          item.rank < 1 ||
          (i > 0 && item.rank <= (parsed.items[i - 1]?.rank ?? 0)),
      )
    )
      return fail();
    return { kind: "gap_list", meta: metadata, gap_list: parsed };
  }
  return fail();
}
