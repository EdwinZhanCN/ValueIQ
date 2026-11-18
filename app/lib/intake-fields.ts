import type { Goal, Input } from "../../shared/form";
import {
  teamDefaultNote,
  type OfferedDefaults,
} from "../../shared/team-settings";
export const GOAL_LABELS: Record<Goal, string> = {
  time_savings: "Time savings",
  data_quality: "Data quality",
  decision_speed: "Decision speed",
  risk_reduction: "Risk reduction",
  new_clients: "New clients",
};
export const LABELS: Record<string, string> = {
  currency: "Currency",
  horizon_years: "Years to evaluate",
  goals: "Goals",
  file_descriptions: "File descriptions",
  project_name: "Project name",
  decision_statement: "Decision to support",
  company_description: "About the company",
  product_description: "The product or idea",
  team_utilization_pct:
    "How busy the team is today (% of time on paid or planned work)",
  leads_reached_per_year: "Leads reached per year",
  response_rate_pct: "Response rate (%)",
  close_rate_pct: "Close rate (%)",
  gross_profit_per_customer: "Gross profit per new customer, first year",
  capacity_cap_customers: "Most new customers you can serve per year",
  discount_rate_pct: "Discount rate (%)",
  adoption_by_year: "Adoption by year (%)",
  cost_one_time_vendor_license: "Vendor, license and integration (one-time)",
  cost_one_time_internal_labor: "Internal rollout labor cost",
  cost_training_change: "Training and change cost",
  cost_annual_run: "Annual run cost",
  cost_annual_internal_support: "Annual internal support cost",
  cost_annual_program: "Annual program cost (campaigns, mailings, ads)",
  cost_uplift_pct: "Cost uplift override (%)",
  delay_months: "Months until benefits start",
  baseline_alternative: "What happens if you do nothing?",
  staff_affected: "People affected",
  hours_saved_per_staff_week: "Hours saved per person per week",
  minutes_per_task_before: "Minutes per task today",
  minutes_per_task_after: "Minutes per task after the change",
  tasks_per_staff_week: "Tasks per person per week",
  weeks_per_year: "Working weeks per year",
  loaded_hourly_cost: "Loaded hourly cost",
  recapture_pct: "Freed time used productively (%)",
  realized_as_cash: "Documented annual spending reduction",
  records_or_events_per_year: "Records or events per year",
  error_rate_before: "Error rate today (%)",
  error_rate_after: "Error rate after the change (%)",
  error_count_before: "Errors per year today",
  error_count_after: "Errors per year after the change",
  cost_per_error: "Cost per error",
  cost_per_clean_unit: "Cost per clean unit",
  error_cost_multiplier: "Error cost multiplier",
  stages_downstream: "Downstream stages handling errors",
  cost_sources: "Included error cost categories",
  cost_nature: "Does this benefit avoid cash expense or free capacity?",
  decisions_per_year: "Decisions per year",
  days_to_decide_before: "Days to decide today",
  days_to_decide_after: "Days to decide after the change",
  cost_of_delay_per_day: "Cost of one day of delay",
  cost_of_delay_basis: "Basis for delay cost",
  example_decision: "A dated example decision",
  event_type: "Adverse event",
  aro_before: "Events per year today",
  aro_after: "Events per year after the change",
  loss_per_event: "Loss per event",
  asset_value: "Exposed asset value",
  exposure_factor_pct: "Asset loss per event (%)",
  cost_bearer: "Who bears the loss?",
};
export const DEFAULTS: Record<
  string,
  Pick<Input, "value" | "tier" | "origin" | "note">
> = {
  discount_rate_pct: {
    value: 10,
    tier: "benchmark",
    origin: "default",
    note: "Forrester TEI convention (organizations typically 8-16%)",
  },
  recapture_pct: {
    value: 50,
    tier: "benchmark",
    origin: "default",
    note: "Nucleus productivity correction factor 0.5",
  },
  weeks_per_year: {
    value: 48,
    tier: "assumption",
    origin: "default",
    note: "Team assumption: Priya / Sprint 1 illustration, not a universal working calendar.",
  },
  error_cost_multiplier: {
    value: 10,
    tier: "benchmark",
    origin: "default",
    note: "Redman Rule of Ten proxy; see research source status before external citation.",
  },
};

/** A default Clarify offers; `team` marks one that comes from team settings. */
export type DefaultProxy = Pick<Input, "value" | "tier" | "origin" | "note"> & {
  team?: { rationale: string | null; source: string | null; starting: boolean };
};

/**
 * The built-in defaults with the team's discount rate and recapture laid
 * over them (#88). Weeks per year and the error cost multiplier stay built in.
 */
export function defaultsFor(
  team?: OfferedDefaults,
): Record<string, DefaultProxy> {
  const out: Record<string, DefaultProxy> = { ...DEFAULTS };
  if (!team) return out;
  for (const id of ["discount_rate_pct", "recapture_pct"] as const) {
    const base = DEFAULTS[id]!;
    const t = team[id];
    out[id] = {
      ...base,
      value: t.value,
      note: teamDefaultNote(t),
      team: { rationale: t.rationale, source: t.source, starting: t.starting },
    };
  }
  return out;
}

/** Form fields the Intake step edits. Every other field belongs to Clarify. */
export const INTAKE_FIELDS = [
  "project_name",
  "decision_statement",
  "company_description",
  "product_description",
  "goals",
  "files",
  "file_descriptions",
] as const;
