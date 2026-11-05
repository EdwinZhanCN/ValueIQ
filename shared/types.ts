/** Proposed I3 contract. Owner review is required before runtime adoption. */
export const GOALS = [
  "time_savings",
  "data_quality",
  "decision_speed",
  "risk_reduction",
] as const;
export type Goal = (typeof GOALS)[number];
export type Tier =
  | "measured"
  | "documented"
  | "benchmark"
  | "estimate"
  | "assumption"
  | "user_unknown";
export type Origin =
  "user" | "file" | "default" | "proxy_accepted" | "assistant_accepted";
export type CostBasis = "quoted" | "estimated" | "assumed";
export type Period = "per_year" | "per_week" | "per_event" | "one_time";

export interface Evidence {
  tier: Tier;
  origin: Origin;
  /** Human-readable source, including the rationale for a team assumption. */
  source: string;
  note?: string;
}

export interface Backing {
  source_file_id?: string;
  quote?: string;
  quote_confirmed?: boolean;
  second_source_value?: number;
  second_source_note?: string;
  observations?: number;
  period_months?: number;
  source_date?: string;
  verified?: boolean;
  verified_by?: string;
}

export type InputId =
  | "cost_one_time_vendor_license"
  | "cost_one_time_internal_labor"
  | "cost_training_change"
  | "cost_annual_run"
  | "cost_annual_internal_support"
  | "cost_uplift_pct"
  | "delay_months"
  | "baseline_alternative"
  | "staff_affected"
  | "minutes_per_task_before"
  | "minutes_per_task_after"
  | "hours_saved_per_staff_week"
  | "tasks_per_staff_week"
  | "weeks_per_year"
  | "loaded_hourly_cost"
  | "recapture_pct"
  | "realized_as_cash"
  | "records_or_events_per_year"
  | "error_rate_before"
  | "error_rate_after"
  | "error_count_before"
  | "error_count_after"
  | "cost_per_error"
  | "cost_per_clean_unit"
  | "error_cost_multiplier"
  | "stages_downstream"
  | "cost_sources"
  | "decisions_per_year"
  | "days_to_decide_before"
  | "days_to_decide_after"
  | "cost_of_delay_per_day"
  | "cost_of_delay_basis"
  | "example_decision"
  | "event_type"
  | "aro_before"
  | "aro_after"
  | "loss_per_event"
  | "asset_value"
  | "exposure_factor_pct"
  | "cost_bearer";

export interface Input extends Evidence {
  id: InputId;
  // Arrays support the existing cost_sources[] field; they are not new engine IDs.
  value: number | string | string[] | null;
  unit: string;
  period?: Period;
  low?: number;
  high?: number;
  basis?: CostBasis;
  backing?: Backing;
  /** Required for null values. Exclusion never means a zero benefit. */
  unknown_reason?: string;
}

export type SettingId =
  "currency" | "horizon_years" | "discount_rate_pct" | "adoption_by_year";

export interface FormFile {
  contract_version: 1;
  project_name: string;
  decision_statement: string;
  goals: Goal[];
  currency: string;
  horizon_years: number;
  discount_rate_pct: number | null;
  adoption_by_year: (number | null)[];
  /** Provenance for settings whose values live in the envelope, not inputs[]. */
  setting_evidence: Record<SettingId, Evidence>;
  inputs: Input[];
  /** Persistent file IDs supplied by infrastructure, never local paths or R2 keys. */
  files: { id: string; kind: "project_description" | "data" }[];
  file_groups: { id: string; file_ids: string[]; description: string }[];
  /** Per-file projection of the group description for existing assistant/storage APIs. */
  file_descriptions: Record<string, string>;
  other_notes: string;
  measurement_plan: Partial<
    Record<
      Goal,
      {
        metric: "before_after" | "survey" | "audit" | "system_report";
        baseline: string;
        baseline_source: string;
        owner: string;
        frequency: string;
      }
    >
  >;
  /** Stable field IDs already presented; not a log of accepted answers. */
  asked: string[];
}
