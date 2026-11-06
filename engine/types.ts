// ValueIQ calculation engine types. Pure data; JSON-safe (no NaN, undefined or Date).
// RunOutput follows docs/research/plans/04-output.md plus the fixture additions
// (Step.label/by_year, Driver.label/included, sensitivity.x_labels, year-0 cash row).

export type Tier =
  "measured" | "documented" | "benchmark" | "estimate" | "assumption";
export type InputTier = Tier | "user_unknown";
export type DriverId =
  "time_savings" | "data_quality" | "decision_speed" | "risk_reduction";
export type LabelClass =
  | "hard_savings"
  | "capacity_value"
  | "avoided_loss"
  | "incremental_profit"
  | "customer_benefit";
export type Origin =
  "user" | "file" | "default" | "proxy_accepted" | "assistant_accepted";
export type CostBasis = "quoted" | "estimated" | "assumed";
export type ScenarioName = "conservative" | "expected" | "optimistic";

// ---------- form file (01a-input-structure.md section 2) ----------
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

export type InputValue = number | string | boolean | number[] | string[] | null;

export interface Input {
  id: string;
  value: InputValue; // null = unknown, never zero
  unit?: string;
  period?: "per_year" | "per_week" | "per_event" | "one_time";
  low?: number;
  high?: number;
  tier: InputTier;
  origin?: Origin;
  basis?: CostBasis;
  backing?: Backing;
  vendor_supplied?: boolean; // engine addition: feeds the vendor-numbers guardrail
  note?: string;
}

export interface MeasurementPlanEntry {
  metric: string;
  baseline: string;
  baseline_source: string;
  owner: string;
  frequency: string;
}

export interface FormFile {
  version?: number;
  goals: DriverId[];
  currency?: string;
  horizon_years?: number;
  discount_rate_pct?: number;
  inputs: Input[];
  file_descriptions?: Record<string, string>;
  other_notes?: string;
  measurement_plan?: Partial<Record<DriverId, MeasurementPlanEntry>>;
  asked?: string[];
}

// ---------- run output ----------
export interface Meta {
  run_id: string;
  mode: "real" | "stub";
  label: "Pre-funding estimate";
  currency: string;
  horizon_years: number;
  discount_rate_pct: number;
  scenario: "expected";
  tier_counts: Record<Tier, number>;
  contract_version: string;
  formula_version: string;
  settings_version: string;
  generated_at: string;
}

export interface Payback {
  years: number | null;
  text: string;
}
export interface Pair {
  hard: number | null;
  capacity_inclusive: number | null;
}
export interface Headline {
  npv: Pair;
  roi: { undiscounted: Pair; pv: Pair }; // percent, e.g. 313.85
  payback: { hard: Payback; capacity_inclusive: Payback };
  benefits_pv: number | null;
  costs_pv: number | null;
  null_reasons: Record<string, string>;
}

export interface Step {
  ref: string;
  order: number;
  name: string; // gross | adoption | recapture | haircut | hard_cash | adjusted
  label: string;
  formula: string;
  inputs: { id: string; label: string; value: number | string }[];
  source_type: "user" | "file" | "default" | "proxy" | "calculated";
  by_year: number[];
  value: number; // sum over the horizon
  evidence_tier: Tier | null;
}

export interface Driver {
  id: DriverId;
  label_class: LabelClass;
  label: string;
  included: boolean;
  steps: Step[];
  annual: { year: number; benefit: number }[];
  haircut_pct: number;
  confidence: number;
  tier_counts: Record<Tier, number>;
  total: number;
  pv: number;
  share_of_benefit: number;
  measured_by: string;
  risk_factors: string[];
}

export interface CostLine {
  id: string;
  label: string;
  base: number;
  basis: CostBasis;
  uplift_pct: number;
  adjusted: number;
  ref: string;
}
export interface Costs {
  lines: CostLine[];
  total_pv: number;
  delay_months: number;
}
export interface CashFlowRow {
  year: number;
  benefits_hard: number;
  benefits_capacity: number;
  costs: number;
  net: number;
  cumulative: number;
}
export interface ScenarioSummary {
  npv_hard: number | null;
  npv_capacity_inclusive: number | null;
  roi_pv_capacity_inclusive: number | null;
  what_moved: string;
}
export interface SensPoint {
  x: number;
  npv_hard: number | null;
  npv_capacity_inclusive: number | null;
}
export interface Charts {
  waterfall: { label: string; value: number }[];
  driver_contribution: { driver: DriverId; value: number }[];
  sensitivity: SensPoint[];
}
export interface ConfidenceLedger {
  integrity: { passed: boolean; checks: { name: string; passed: boolean }[] };
  drivers: {
    id: DriverId;
    confidence: number;
    floor: number;
    included: boolean;
  }[];
  project: { confidence: number; floor: number; capped_by?: DriverId };
  band_note: string;
}
export interface Narrative {
  summary: string;
  by_driver: Partial<Record<DriverId, string>>;
}
export interface Unquantified {
  target: string;
  reason: string;
  raise_with: string;
}
export interface ProxyUsed {
  input_id: string;
  value: number | string;
  source: string;
  tier: Tier;
}
export interface Override {
  path: string;
  computed_value: number;
  override_value: number;
  reason: string;
  author: string;
  at: string;
}
export interface Warning {
  code: string;
  message: string;
  refs: string[];
}

export interface Result {
  headline: Headline;
  drivers: Driver[];
  costs: Costs;
  cash_flows: CashFlowRow[];
  scenarios: Record<ScenarioName, ScenarioSummary>;
  sensitivity: {
    x_labels: { discount_rate: string; adoption: string; haircut: string };
    discount_rate: SensPoint[];
    adoption: SensPoint[];
    haircut: SensPoint[];
  };
  charts: Charts;
  confidence: ConfidenceLedger;
  narrative: Narrative;
  unquantified: Unquantified[];
  flexibility: string[];
  doing_nothing_risks: string[];
  proceeding_risks: string[];
  measurement_plan: Partial<Record<DriverId, MeasurementPlanEntry>>;
  proxies_used: ProxyUsed[];
  overrides: Override[];
  warnings: Warning[];
}

export interface GapItem {
  rank: number;
  target: string;
  label: string;
  what_to_add: string;
  confidence_now: number;
  confidence_if_added: number;
  return_to: { screen: "intake"; input_id: string };
}
export interface GapList {
  reason: string;
  project_confidence: number;
  project_floor: number;
  items: GapItem[];
  dropped_drivers: { id: DriverId; confidence: number; floor: number }[];
}

export interface RunOutput {
  kind: "result" | "gap_list";
  meta: Meta;
  result?: Result;
  gap_list?: GapList;
}

// ---------- validation ----------
export interface ValidationIssue {
  code: string;
  input_id?: string;
  message: string;
}
export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface RunOptions {
  run_id: string;
  generated_at: string; // ISO; also the "now" for the 12-month recency check
  mode?: "real" | "stub";
  config?: Partial<EngineConfig>;
}

export interface EngineConfig {
  bands: Record<Tier, [number, number]>;
  weights: {
    source: number;
    corroborated: number;
    coverage: number;
    recent: number;
    tight_range: number;
    verified: number;
  };
  corroboration_tolerance: number; // 0.20
  tight_range_tolerance: number; // 0.20
  coverage_observations: number; // 30
  coverage_months: number; // 12
  recency_months: number; // 12
  cost_uplift_pct: Record<CostBasis, number>;
  driver_floors: Record<DriverId, number>;
  project_floor: number;
  big_driver_share: number; // 0.30
  scenario: {
    adoption_mult: { conservative: number; optimistic: number };
    recapture_delta_pts: { conservative: number; optimistic: number };
  };
  sensitivity: {
    discount_rates_pct: number[];
    adoption_mults: number[];
    extra_haircut_pts: number[];
  };
  guardrails: {
    driver_share: number; // 0.50
    vendor_share: number; // 0.50
    assumption_share: number; // 0.25
    npv_flip_points: number; // 3
  };
  versions: { contract: string; formula: string; settings: string };
}
