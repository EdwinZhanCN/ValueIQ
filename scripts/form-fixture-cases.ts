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
    { id: "fixture-time", projectId: "fixture-project" },
    { id: "fixture-errors", projectId: "fixture-project" },
    { id: "fixture-risk", projectId: "fixture-project" },
    { id: "foreign-project-file", projectId: "another-project" },
  ],
};
export const referenceDate = "2026-11-05T12:00:00.000Z";
const recent = "2026-10-01";

function input(
  id: string,
  value: InputValue,
  unit: string,
  metadata: Partial<Omit<Input, "id" | "value" | "unit">> = {},
): Input {
  return { id, value, unit, tier: "documented", origin: "user", ...metadata };
}
function effect(
  id: string,
  value: number,
  unit: string,
  backing: Backing,
): Input {
  return input(id, value, unit, {
    tier: "documented",
    origin: "file",
    backing,
  });
}
function base(): FormFile {
  return {
    version: 1,
    goals: ["time_savings"],
    currency: "USD",
    horizon_years: 3,
    discount_rate_pct: 10,
    inputs: [
      input("project_name", "Engine handoff fixture", "text"),
      input(
        "decision_statement",
        "Should we fund the proposed operations improvement?",
        "text",
      ),
      input("discount_rate_pct", 10, "percent", {
        tier: "benchmark",
        origin: "default",
        note: "Default accepted for this test: Forrester TEI 10%, per case specification.",
      }),
      input("adoption_by_year", [50, 80, 90], "percent"),
      input("staff_affected", 10, "count"),
      input("weeks_per_year", 40, "weeks"),
      input("loaded_hourly_cost", 50, "currency/h"),
      input("recapture_pct", 50, "percent", {
        tier: "benchmark",
        origin: "default",
        note: "Default specified by INPUT-TEST-CASES.md; Nucleus productivity factor.",
      }),
      input("cost_one_time_vendor_license", 30000, "currency", {
        period: "one_time",
        basis: "quoted",
      }),
      input("cost_annual_run", 12000, "currency/yr", {
        period: "per_year",
        basis: "quoted",
      }),
    ],
    file_descriptions: {},
    other_notes:
      "Synthetic pre-integration fixture; no real project or file was uploaded.",
    measurement_plan: {},
    asked: [],
  } satisfies FormFile;
}
function gap(): FormFile {
  const form = base();
  form.inputs.push(
    input("hours_saved_per_staff_week", 5, "hours", {
      period: "per_week",
      tier: "estimate",
      origin: "user",
      backing: { source_date: recent },
    }),
  );
  return form;
}
function result(): FormFile {
  const form = base();
  form.goals = ["time_savings", "data_quality", "risk_reduction"];
  form.file_descriptions = {
    "fixture-time":
      "Synthetic written time-saving assessment; verified by the process owner.",
    "fixture-errors":
      "Synthetic annual expedite/error analysis with a recent data date.",
    "fixture-risk":
      "Synthetic incident/loss analysis; verified by the risk owner.",
  };
  const time: Backing = { source_file_id: "fixture-time", verified: true };
  const errors: Backing = {
    source_file_id: "fixture-errors",
    observations: 30,
    source_date: recent,
  };
  const risk: Backing = { source_file_id: "fixture-risk", verified: true };
  form.inputs.push(
    {
      ...effect("hours_saved_per_staff_week", 5, "hours", time),
      period: "per_week",
    },
    input("records_or_events_per_year", 600, "count", { period: "per_year" }),
    {
      ...effect("error_count_before", 72, "count", errors),
      period: "per_year",
    },
    { ...effect("error_count_after", 24, "count", errors), period: "per_year" },
    effect("cost_per_error", 690, "currency", errors),
    input("cost_sources", ["expedite"], "enum list"),
    input("cost_nature", "cash", "enum"),
    input("event_type", "sustained outage", "text"),
    { ...effect("aro_before", 3, "events/yr", risk), period: "per_year" },
    { ...effect("aro_after", 1.5, "events/yr", risk), period: "per_year" },
    {
      ...effect("loss_per_event", 25000, "currency", {
        ...risk,
        observations: 30,
        source_date: recent,
      }),
      low: 22500,
      high: 27500,
    },
    input("cost_bearer", "organization", "enum"),
    input("cost_training_change", 5000, "currency", {
      period: "one_time",
      basis: "estimated",
      tier: "estimate",
    }),
    input("delay_months", 0, "months"),
  );
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

/** These are form-state submissions, not JSON fixture literals. Every candidate
 * is exported by app/lib/intake-form.ts and round-tripped by the same parser.
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
    input("minutes_per_task_before", 30, "min"),
    input("minutes_per_task_after", 40, "min"),
    input("tasks_per_staff_week", 10, "count", { period: "per_week" }),
  );
  const unknown = gap();
  unknown.inputs.push(input("not_in_field_spec", 1, "count"));
  const foreign = result();
  foreign.inputs.find(
    (entry) => entry.id === "hours_saved_per_staff_week",
  )!.backing = { source_file_id: "foreign-project-file", verified: true };
  const measured = gap();
  measured.inputs.find(
    (entry) => entry.id === "hours_saved_per_staff_week",
  )!.tier = "measured";
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
    // Delay is optional in sample-gap-list; add a valid record before changing it.
    {
      id: "invalid-delay-241",
      form: {
        ...gap(),
        inputs: [...gap().inputs, input("delay_months", 241, "months")],
      },
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
