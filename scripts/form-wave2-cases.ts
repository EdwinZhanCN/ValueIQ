import type { FormFile, Goal, Input } from "../shared/form.ts";
import { fixtureCases, type FixtureCase } from "./form-fixture-cases.ts";

export const WAVE2_REFERENCE_COMMIT =
  "a1f05169707d5e79aafad288c1a3bc7328c05982";
const COMMON = [
  "adoption_by_year",
  "discount_rate_pct",
  "cost_one_time_vendor_license",
  "cost_training_change",
  "cost_annual_run",
];
const DRIVER_FIELDS: Record<Goal, string[]> = {
  time_savings: [
    "staff_affected",
    "hours_saved_per_staff_week",
    "weeks_per_year",
    "loaded_hourly_cost",
    "recapture_pct",
  ],
  data_quality: [
    "error_count_before",
    "error_count_after",
    "cost_per_error",
    "cost_nature",
  ],
  risk_reduction: ["aro_before", "aro_after", "loss_per_event"],
  decision_speed: [],
};
const record = (
  id: string,
  value: Input["value"],
  extra: Partial<Omit<Input, "id" | "value">> = {},
): Input => ({ id, value, tier: "documented", origin: "user", ...extra });
const strongBacking = () => ({
  source_file_id: "f1",
  observations: 100,
  source_date: "2026-09-30",
  verified: true,
});
function decisionInputs(): Input[] {
  return [
    record("decisions_per_year", 50),
    record("days_to_decide_before", 10, { backing: strongBacking() }),
    record("days_to_decide_after", 6, { backing: strongBacking() }),
    record("cost_of_delay_per_day", 400, { backing: strongBacking() }),
    record("cost_of_delay_basis", "revenue_deferred"),
    record("example_decision", "Q2 vendor approval took 10 days"),
  ];
}
function get(form: FormFile, id: string): Input {
  const input = form.inputs.find((item) => item.id === id);
  if (!input) throw new Error(`Wave-two source submission is missing ${id}`);
  return input;
}

/** Independent typed submissions. This producer never reads the reference
 * JSON or engine outputs; equality tests use those references separately.
 */
export function wave2Cases(): FixtureCase[] {
  const minimum = fixtureCases().find((item) => item.id === "sample-result");
  if (!minimum) throw new Error("Missing typed sample-result submission.");
  const baseline = structuredClone(minimum.form);
  // Eli's second-wave references intentionally omit the first sample's plan
  // and question log. Do not fabricate that interaction history for new cases.
  baseline.measurement_plan = {};
  baseline.asked = [];
  const golden = () => structuredClone(baseline);
  const single = (goal: Goal) => {
    const form = golden();
    form.goals = [goal];
    const allowed = new Set([...COMMON, ...DRIVER_FIELDS[goal]]);
    form.inputs = form.inputs.filter((input) => allowed.has(input.id));
    if (goal === "decision_speed") form.inputs.push(...decisionInputs());
    return form;
  };
  const combined = golden();
  combined.goals = [
    "time_savings",
    "data_quality",
    "decision_speed",
    "risk_reduction",
  ];
  combined.inputs.push(...decisionInputs());
  const hardCash = single("time_savings");
  hardCash.inputs.push(
    record("realized_as_cash", 20000, { backing: strongBacking() }),
  );
  const customer = golden();
  customer.inputs.push(record("cost_bearer", "customer"));
  const zeroCost = golden();
  for (const id of [
    "cost_one_time_vendor_license",
    "cost_training_change",
    "cost_annual_run",
  ])
    get(zeroCost, id).value = 0;
  const delayed = golden();
  delayed.inputs.push(record("delay_months", 6));
  const noPayback = golden();
  get(noPayback, "cost_one_time_vendor_license").value = 500000;
  const negativeNpv = golden();
  get(negativeNpv, "cost_one_time_vendor_license").value = 200000;
  const dropped = golden();
  for (const id of [
    "error_count_before",
    "error_count_after",
    "cost_per_error",
  ]) {
    const input = get(dropped, id);
    input.tier = "estimate";
    delete input.backing;
  }
  const belowFloor = single("time_savings");
  get(belowFloor, "hours_saved_per_staff_week").tier = "benchmark";
  const estimate = single("time_savings");
  Object.assign(get(estimate, "hours_saved_per_staff_week"), {
    tier: "estimate",
    backing: strongBacking(),
  });
  const nullEffect = golden();
  get(nullEffect, "hours_saved_per_staff_week").value = null;
  const unknownTier = golden();
  get(unknownTier, "hours_saved_per_staff_week").tier = "user_unknown";
  delete get(unknownTier, "hours_saved_per_staff_week").backing;
  const accepted = (id: string, form: FormFile): FixtureCase => ({
    id,
    form,
    expected: "accepted",
  });
  return [
    accepted("driver-time-savings", single("time_savings")),
    accepted("driver-data-quality", single("data_quality")),
    accepted("driver-decision-speed", single("decision_speed")),
    accepted("driver-risk-reduction", single("risk_reduction")),
    accepted("combined-all-four", combined),
    accepted("class-hard-cash", hardCash),
    accepted("class-no-cash", single("time_savings")),
    accepted("class-customer-borne", customer),
    accepted("edge-zero-cost", zeroCost),
    accepted("edge-delay-6", delayed),
    accepted("edge-no-payback", noPayback),
    accepted("edge-negative-npv", negativeNpv),
    accepted("gate-all-pass", golden()),
    accepted("gate-one-driver-dropped", dropped),
    accepted("gate-project-below-floor", belowFloor),
    accepted("gate-driver-over-30pct", golden()),
    accepted("gate-estimate-effect", estimate),
    accepted("unknown-null-effect", nullEffect),
    accepted("unknown-user-unknown-tier", unknownTier),
  ];
}
