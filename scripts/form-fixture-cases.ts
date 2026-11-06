import type {
  Backing,
  FormContext,
  FormFile,
  Input,
  InputValue,
} from "../shared/form.ts";

export const context: FormContext = {
  projectId: "fixture-project",
  files: [
    { id: "f1", projectId: "fixture-project" },
    { id: "foreign-project-file", projectId: "another-project" },
  ],
};
export const referenceDate = "2026-11-05T12:00:00.000Z";
const recent = "2026-09-30";

function input(
  id: string,
  value: InputValue,
  metadata: Partial<Omit<Input, "id" | "value">> = {},
): Input {
  return { id, value, tier: "documented", origin: "user", ...metadata };
}
function effect(id: string, value: number, backing: Backing): Input {
  // A user-entered, documented value can cite a file without changing origin.
  return input(id, value, { backing });
}
const adoption = () =>
  input("adoption_by_year", [50, 80, 90], { tier: "estimate" });
const recapture = () =>
  input("recapture_pct", 50, {
    tier: "benchmark",
    origin: "default",
    note: "Nucleus productivity correction factor 0.5",
  });
const discount = () =>
  input("discount_rate_pct", 10, {
    tier: "benchmark",
    origin: "default",
    note: "Forrester TEI convention (organizations typically 8-16%)",
  });
const vendorCost = () =>
  input("cost_one_time_vendor_license", 30000, { basis: "quoted" });
const runCost = () => input("cost_annual_run", 12000, { basis: "quoted" });

function base(): FormFile {
  return {
    version: 1,
    goals: ["time_savings"],
    currency: "USD",
    horizon_years: 3,
    inputs: [],
    file_descriptions: {},
    other_notes: "",
    measurement_plan: {},
    asked: [],
  } satisfies FormFile;
}
function gap(): FormFile {
  const form = base();
  form.inputs = [
    adoption(),
    input("staff_affected", 10),
    input("weeks_per_year", 40),
    input("loaded_hourly_cost", 50),
    recapture(),
    discount(),
    vendorCost(),
    runCost(),
    input("hours_saved_per_staff_week", 5, {
      tier: "estimate",
      backing: { source_date: recent },
    }),
  ];
  return form;
}
function result(): FormFile {
  const form = base();
  form.goals = ["time_savings", "data_quality", "risk_reduction"];
  form.file_descriptions = { f1: "test file" };
  const verified: Backing = { source_file_id: "f1", verified: true };
  const covered: Backing = {
    source_file_id: "f1",
    observations: 100,
    source_date: recent,
  };
  form.inputs = [
    adoption(),
    input("staff_affected", 10),
    effect("hours_saved_per_staff_week", 5, verified),
    input("weeks_per_year", 40),
    input("loaded_hourly_cost", 50),
    recapture(),
    discount(),
    effect("error_count_before", 72, covered),
    effect("error_count_after", 24, covered),
    effect("cost_per_error", 690, covered),
    input("cost_nature", "cash"),
    effect("aro_before", 3, verified),
    effect("aro_after", 1.5, verified),
    {
      ...effect("loss_per_event", 25000, { ...covered, verified: true }),
      low: 22500,
      high: 27500,
    },
    vendorCost(),
    input("cost_training_change", 5000, { basis: "estimated" }),
    runCost(),
  ];
  form.measurement_plan = {
    time_savings: {
      metric: "Time study before and after launch",
      baseline: "30 minutes per ticket",
      baseline_source: "Ops time sample, Q3",
      owner: "Ops lead",
      frequency: "monthly",
    },
  };
  form.asked = ["hours_saved_per_staff_week", "cost_per_error"];
  return form;
}

export interface FixtureCase {
  id: string;
  form: FormFile;
  expected: "accepted" | "rejected";
  field?: string;
  code?: string;
}
function change(
  id: string,
  field: string,
  value: InputValue,
  code: string,
): FixtureCase {
  const form = gap();
  const record = form.inputs.find((entry) => entry.id === field);
  if (!record) throw new Error(`Fixture input missing: ${field}`);
  record.value = value;
  return { id, form, expected: "rejected", field, code };
}

/** Independent typed form-state submissions, never loaded from the reference
 * JSON. The equality test compares the real serializer output with Eli's file.
 */
export function fixtureCases(): FixtureCase[] {
  const horizon0 = gap();
  horizon0.horizon_years = 0;
  horizon0.inputs.find((entry) => entry.id === "adoption_by_year")!.value = [];
  const horizon21 = gap();
  horizon21.horizon_years = 21;
  horizon21.inputs.find((entry) => entry.id === "adoption_by_year")!.value =
    Array<number>(21).fill(50);
  const after = gap();
  after.inputs = after.inputs.filter(
    (entry) => entry.id !== "hours_saved_per_staff_week",
  );
  after.inputs.push(
    input("minutes_per_task_before", 30),
    input("minutes_per_task_after", 40),
    input("tasks_per_staff_week", 10),
  );
  const unknown = gap();
  unknown.inputs.push(input("not_in_field_spec", 1));
  const foreign = result();
  foreign.inputs.find(
    (entry) => entry.id === "hours_saved_per_staff_week",
  )!.backing = { source_file_id: "foreign-project-file", verified: true };
  const measured = gap();
  measured.inputs.find(
    (entry) => entry.id === "hours_saved_per_staff_week",
  )!.tier = "measured";
  const delay = gap();
  delay.inputs.push(input("delay_months", 241));
  return [
    { id: "sample-result", form: result(), expected: "accepted" },
    { id: "sample-gap-list", form: gap(), expected: "accepted" },
    change("invalid-adoption-105", "adoption_by_year", [50, 105, 90], "BOUNDS"),
    change(
      "invalid-negative-cost",
      "cost_one_time_vendor_license",
      -1,
      "BOUNDS",
    ),
    change("invalid-noninteger-count", "staff_affected", 2.5, "INTEGER"),
    {
      id: "invalid-horizon-0",
      form: horizon0,
      expected: "rejected",
      field: "horizon_years",
      code: "HORIZON",
    },
    {
      id: "invalid-horizon-21",
      form: horizon21,
      expected: "rejected",
      field: "horizon_years",
      code: "HORIZON",
    },
    {
      id: "invalid-delay-241",
      form: delay,
      expected: "rejected",
      field: "delay_months",
      code: "BOUNDS",
    },
    {
      id: "invalid-after-gt-before",
      form: after,
      expected: "rejected",
      field: "minutes_per_task_after",
      code: "AFTER_BEFORE",
    },
    change(
      "invalid-adoption-length",
      "adoption_by_year",
      [50, 80],
      "ADOPTION_LENGTH",
    ),
    {
      id: "invalid-unknown-id",
      form: unknown,
      expected: "rejected",
      field: "not_in_field_spec",
      code: "UNKNOWN_ID",
    },
    {
      id: "invalid-wrong-file",
      form: foreign,
      expected: "rejected",
      field: "hours_saved_per_staff_week",
      code: "FOREIGN_FILE",
    },
    change(
      "invalid-null-essential",
      "cost_one_time_vendor_license",
      null,
      "ESSENTIAL_COST",
    ),
    {
      id: "invalid-measured-typed",
      form: measured,
      expected: "rejected",
      field: "hours_saved_per_staff_week",
      code: "MEASURED_TYPED",
    },
  ];
}
