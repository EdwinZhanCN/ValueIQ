// Input catalog: ids, roles, bounds (ROI.md section 3, 01a-input-structure.md).
import type { DriverId } from "./types";

export type Role = "effect" | "known" | "cost" | "context";
export type Kind =
  "number" | "int" | "percent" | "text" | "array" | "enum" | "bool";

export interface CatalogEntry {
  role: Role;
  kind: Kind;
  min?: number;
  max?: number;
  minExclusive?: boolean;
  label: string;
  essential?: boolean;
}

const e = (
  label: string,
  kind: Kind,
  role: Role,
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  label,
  kind,
  role,
  ...extra,
});

export const CATALOG: Record<string, CatalogEntry> = {
  // project / settings
  project_name: e("Project name", "text", "context"),
  decision_statement: e("Decision statement", "text", "context"),
  goals: e("Goals", "array", "context"),
  other_notes: e("Other notes", "text", "context"),
  files: e("Files", "array", "context"),
  currency: e("Currency", "text", "known"),
  horizon_years: e("Years to evaluate", "int", "known", { min: 1, max: 20 }),
  discount_rate_pct: e("Discount rate", "percent", "known", {
    min: 0,
    max: 100,
  }),
  adoption_by_year: e("Adoption by year", "array", "known"),
  baseline_alternative: e("What doing nothing costs", "text", "context"),
  // costs
  cost_one_time_vendor_license: e(
    "Vendor, license, integration (one-time)",
    "number",
    "cost",
    { min: 0, essential: true },
  ),
  cost_one_time_internal_labor: e(
    "Internal labor (one-time)",
    "number",
    "cost",
    { min: 0 },
  ),
  cost_training_change: e(
    "Training and change management (one-time)",
    "number",
    "cost",
    { min: 0 },
  ),
  cost_annual_run: e("Annual run cost", "number", "cost", {
    min: 0,
    essential: true,
  }),
  cost_annual_internal_support: e("Annual internal support", "number", "cost", {
    min: 0,
  }),
  cost_uplift_pct: e("Cost uplift override", "percent", "cost", {
    min: 0,
    max: 1000,
  }),
  delay_months: e("Months until benefits start", "int", "known", {
    min: 0,
    max: 240,
  }),
  // time savings
  staff_affected: e("People affected", "int", "known", { min: 1 }),
  minutes_per_task_before: e("Minutes per task today", "number", "effect", {
    min: 0,
    minExclusive: true,
  }),
  minutes_per_task_after: e(
    "Minutes per task with the project",
    "number",
    "effect",
    { min: 0 },
  ),
  hours_saved_per_staff_week: e(
    "Hours saved per person per week",
    "number",
    "effect",
    { min: 0 },
  ),
  tasks_per_staff_week: e("Tasks per person per week", "number", "known", {
    min: 0,
  }),
  weeks_per_year: e("Working weeks per year", "number", "known", {
    min: 1,
    max: 52,
  }),
  loaded_hourly_cost: e("Loaded hourly cost", "number", "known", {
    min: 0,
    minExclusive: true,
  }),
  recapture_pct: e(
    "Share of freed time turned into useful work",
    "percent",
    "known",
    { min: 0, max: 100 },
  ),
  realized_as_cash: e(
    "Documented cash reduction per year",
    "number",
    "effect",
    { min: 0 },
  ),
  // data quality
  records_or_events_per_year: e("Records or events per year", "int", "known", {
    min: 0,
  }),
  error_rate_before: e("Error rate today", "percent", "effect", {
    min: 0,
    max: 100,
  }),
  error_rate_after: e("Error rate with the project", "percent", "effect", {
    min: 0,
    max: 100,
  }),
  error_count_before: e("Errors per year today", "int", "effect", { min: 0 }),
  error_count_after: e("Errors per year with the project", "int", "effect", {
    min: 0,
  }),
  cost_per_error: e("Cost of one error", "number", "effect", { min: 0 }),
  cost_per_clean_unit: e("Cost of one clean unit", "number", "known", {
    min: 0,
  }),
  error_cost_multiplier: e("Rule of Ten multiplier", "number", "known", {
    min: 1,
  }),
  stages_downstream: e("Stages that re-handle a bad record", "int", "known", {
    min: 0,
  }),
  cost_sources: e("Cost sources", "array", "context"),
  cost_nature: e("Cash or capacity cost", "enum", "context"),
  // decision speed
  decisions_per_year: e("Decisions per year", "int", "known", { min: 0 }),
  days_to_decide_before: e("Days to decide today", "number", "effect", {
    min: 0,
    minExclusive: true,
  }),
  days_to_decide_after: e(
    "Days to decide with the project",
    "number",
    "effect",
    { min: 0 },
  ),
  cost_of_delay_per_day: e("Cost of one day of delay", "number", "effect", {
    min: 0,
  }),
  cost_of_delay_basis: e("Cost of delay basis", "enum", "context"),
  example_decision: e("Example decision", "text", "context"),
  // risk reduction
  event_type: e("Event type", "text", "context"),
  aro_before: e("Events per year today", "number", "effect", { min: 0 }),
  aro_after: e("Events per year with the project", "number", "effect", {
    min: 0,
  }),
  loss_per_event: e("Loss per event", "number", "effect", { min: 0 }),
  asset_value: e("Asset value", "number", "effect", { min: 0 }),
  exposure_factor_pct: e("Exposure factor", "percent", "effect", {
    min: 0,
    max: 100,
  }),
  cost_bearer: e("Cost bearer", "enum", "context"),
};

/** (before, after) pairs that must satisfy after <= before. */
export const BEFORE_AFTER: [string, string][] = [
  ["minutes_per_task_before", "minutes_per_task_after"],
  ["error_rate_before", "error_rate_after"],
  ["error_count_before", "error_count_after"],
  ["days_to_decide_before", "days_to_decide_after"],
  ["aro_before", "aro_after"],
];

export const COST_ONE_TIME = [
  "cost_one_time_vendor_license",
  "cost_one_time_internal_labor",
  "cost_training_change",
] as const;
export const COST_RECURRING = [
  "cost_annual_run",
  "cost_annual_internal_support",
] as const;
export const ESSENTIAL_COSTS = [
  "cost_one_time_vendor_license",
  "cost_annual_run",
] as const;

export const DRIVER_LABELS: Record<DriverId, string> = {
  time_savings: "Time savings",
  data_quality: "Data quality",
  decision_speed: "Decision speed",
  risk_reduction: "Risk reduction",
};
export const DRIVER_ORDER: DriverId[] = [
  "time_savings",
  "data_quality",
  "decision_speed",
  "risk_reduction",
];
