/** Pre-integration form wire contract: 01a section 2 and engine/types.ts.
 * Adoption is an Input record; version remains the engine's existing field.
 */
export type Goal =
  "time_savings" | "data_quality" | "decision_speed" | "risk_reduction";
export type Tier =
  | "measured"
  | "documented"
  | "benchmark"
  | "estimate"
  | "assumption"
  | "user_unknown";
export type Origin =
  "user" | "file" | "default" | "proxy_accepted" | "assistant_accepted";
export type InputValue = number | string | boolean | number[] | string[] | null;
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
export interface Input {
  id: string;
  value: InputValue;
  unit: string;
  period?: "per_year" | "per_week" | "per_event" | "one_time";
  tier: Tier;
  origin: Origin;
  basis?: "quoted" | "estimated" | "assumed";
  backing?: Backing;
  low?: number;
  high?: number;
  vendor_supplied?: boolean;
  note?: string;
}
export interface FormFile {
  version: 1;
  goals: Goal[];
  currency: string;
  horizon_years: number;
  discount_rate_pct: number;
  inputs: Input[];
  file_descriptions: Record<string, string>;
  other_notes: string;
  measurement_plan: Partial<
    Record<
      Goal,
      {
        metric: string;
        baseline: string;
        baseline_source: string;
        owner: string;
        frequency: string;
      }
    >
  >;
  asked: string[];
}
/** Trusted caller-supplied ownership data, not fields accepted from form JSON. */
export interface FormContext {
  projectId: string;
  files: readonly { id: string; projectId: string }[];
}
export interface FormIssue {
  code: string;
  field: string;
  message: string;
}
