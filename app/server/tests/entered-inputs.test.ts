// "Inputs used in this run": rows come from the form the run pinned, in form
// order; "not sure" never shows as 0; a run without a pinned form gives null.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILE_GONE, enteredInputs } from "../../lib/entered-inputs";

const sample = JSON.parse(
  readFileSync("docs/research/samples/sample-result.form.json", "utf8"),
) as { inputs: { id: string }[] };

const form = (inputs: unknown[]) => ({
  version: 1,
  goals: ["time_savings"],
  currency: "USD",
  horizon_years: 3,
  inputs,
  file_descriptions: {},
  other_notes: "",
  measurement_plan: {},
  asked: [],
});

describe("enteredInputs", () => {
  it("lists every pinned input in form order with labels and units", () => {
    const rows = enteredInputs(sample, [{ id: "f1", name: "timesheet.xlsx" }])!;
    expect(rows.map((r) => r.id)).toEqual(sample.inputs.map((i) => i.id));
    const hourly = rows.find((r) => r.id === "loaded_hourly_cost");
    expect(hourly?.label).toMatch(/hourly/i);
    expect(hourly?.value).toMatch(/USD \/ h$/);
  });

  it("shows Not sure for an unknown input, never 0", () => {
    const rows = enteredInputs(
      form([
        {
          id: "weeks_per_year",
          value: null,
          tier: "user_unknown",
          origin: "user",
          note: "User is not sure; no zero value has been substituted.",
        },
      ]),
      [],
    )!;
    expect(rows[0]).toMatchObject({
      value: "Not sure",
      notSure: true,
      tier: "Not sure",
    });
    expect(rows[0]!.value).not.toMatch(/0/);
  });

  it("names the cited file, or says it is gone", () => {
    const cite = (id: string) => ({
      id: "error_cost",
      value: 690,
      tier: "documented",
      origin: "file",
      basis: undefined,
      backing: { source_file_id: id, quote: "q" },
    });
    expect(
      enteredInputs(form([cite("f9")]), [{ id: "f9", name: "errors.csv" }])![0],
    ).toMatchObject({ file: "errors.csv", source: "From a file" });
    expect(enteredInputs(form([cite("gone")]), [])![0]!.file).toBe(FILE_GONE);
  });

  it("formats percentages, lists, ranges and cost basis", () => {
    const rows = enteredInputs(
      form([
        {
          id: "discount_rate_pct",
          value: 8,
          tier: "benchmark",
          origin: "default",
          note: "Team default: Board rate",
        },
        {
          id: "adoption_by_year",
          value: [50, 80, 90],
          tier: "estimate",
          origin: "user",
        },
        {
          id: "cost_annual_run",
          value: 12000,
          tier: "documented",
          origin: "user",
          basis: "quoted",
          low: 10000,
          high: 14000,
        },
      ]),
      [],
    )!;
    expect(rows[0]).toMatchObject({
      value: "8%",
      source: "Default",
      note: "Team default: Board rate",
    });
    expect(rows[1]!.value).toBe("50, 80, 90%");
    expect(rows[2]).toMatchObject({ basis: "quoted" });
    expect(rows[2]!.value).toContain("12,000");
    expect(rows[2]!.value).toContain("range 10,000–14,000");
  });

  it("gives null when the run pinned no form", () => {
    expect(enteredInputs(null, [])).toBeNull();
    expect(enteredInputs({ goals: [] }, [])).toBeNull();
    expect(enteredInputs("not a form", [])).toBeNull();
  });
});
