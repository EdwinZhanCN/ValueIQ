export interface InputRule {
  kind: "number" | "integer" | "text" | "enum" | "numbers" | "strings";
  role: "known" | "effect" | "cost" | "context";
  min?: number;
  max?: number;
  exclusiveMin?: boolean;
  options?: readonly string[];
}
const numeric = (
  role: InputRule["role"],
  min = 0,
  max?: number,
): InputRule => ({
  kind: "number",
  role,
  min,
  ...(max === undefined ? {} : { max }),
});
const count = (min = 0): InputRule => ({ kind: "integer", role: "known", min });
const text: InputRule = { kind: "text", role: "context" };
const percentage = (role: InputRule["role"]): InputRule =>
  numeric(role, 0, 100);
// Input IDs are 01a/ROI IDs. cost_nature is the explicit PR #123/#128
// addition missing from develop's older field table, not a renamed field.
export const INPUT_RULES: Readonly<Record<string, InputRule>> = {
  project_name: text,
  decision_statement: text,
  other_notes: text,
  currency: { kind: "text", role: "known" },
  goals: {
    kind: "strings",
    role: "context",
    options: [
      "time_savings",
      "data_quality",
      "decision_speed",
      "risk_reduction",
    ],
  },
  files: { kind: "strings", role: "context" },
  horizon_years: { kind: "integer", role: "known", min: 1, max: 20 },
  discount_rate_pct: percentage("known"),
  adoption_by_year: { kind: "numbers", role: "known", min: 0, max: 100 },
  cost_one_time_vendor_license: numeric("cost"),
  cost_one_time_internal_labor: numeric("cost"),
  cost_training_change: numeric("cost"),
  cost_annual_run: numeric("cost"),
  cost_annual_internal_support: numeric("cost"),
  cost_uplift_pct: numeric("cost", 0, 1000),
  delay_months: { kind: "integer", role: "known", min: 0, max: 240 },
  baseline_alternative: text,
  staff_affected: count(1),
  minutes_per_task_before: { ...numeric("effect"), exclusiveMin: true },
  minutes_per_task_after: numeric("effect"),
  hours_saved_per_staff_week: numeric("effect"),
  tasks_per_staff_week: count(),
  weeks_per_year: numeric("known", 1, 52),
  loaded_hourly_cost: { ...numeric("known"), exclusiveMin: true },
  recapture_pct: percentage("known"),
  realized_as_cash: numeric("effect"),
  records_or_events_per_year: count(),
  error_rate_before: percentage("effect"),
  error_rate_after: percentage("effect"),
  error_count_before: { ...count(), role: "effect" },
  error_count_after: { ...count(), role: "effect" },
  cost_per_error: numeric("effect"),
  cost_per_clean_unit: numeric("known"),
  error_cost_multiplier: numeric("known", 1),
  stages_downstream: count(),
  cost_sources: {
    kind: "strings",
    role: "context",
    options: ["rework", "escalation", "expedite", "customer_credit"],
  },
  cost_nature: { kind: "enum", role: "context", options: ["cash", "capacity"] },
  decisions_per_year: count(),
  days_to_decide_before: { ...numeric("effect"), exclusiveMin: true },
  days_to_decide_after: numeric("effect"),
  cost_of_delay_per_day: numeric("effect"),
  cost_of_delay_basis: {
    kind: "enum",
    role: "context",
    options: [
      "revenue_deferred",
      "cost_continuing",
      "risk_exposure",
      "opportunity_lost",
    ],
  },
  example_decision: text,
  event_type: text,
  aro_before: numeric("effect"),
  aro_after: numeric("effect"),
  loss_per_event: numeric("effect"),
  asset_value: numeric("effect"),
  exposure_factor_pct: percentage("effect"),
  cost_bearer: {
    kind: "enum",
    role: "context",
    options: ["organization", "customer", "third_party"],
  },
};
