import { describe, expect, it } from "vitest";
import { computeProject, EngineValidationError } from "../project";
import { validateInputs } from "../validate";
import type { LegacyFormFile, Input } from "../types";
import { OPTS, cost, goldenResultForm, inp, simpleForm } from "./forms";

const setVal = (
  f: LegacyFormFile,
  id: string,
  value: Input["value"],
): LegacyFormFile => ({
  ...f,
  inputs: f.inputs.map((i) => (i.id === id ? { ...i, value } : i)),
});
const add = (f: LegacyFormFile, ...extra: Input[]): LegacyFormFile => ({
  ...f,
  inputs: [...f.inputs, ...extra],
});
const drop = (f: LegacyFormFile, id: string): LegacyFormFile => ({
  ...f,
  inputs: f.inputs.filter((i) => i.id !== id),
});
const codes = (f: LegacyFormFile) =>
  validateInputs(f).errors.map((e) => e.code);

describe("K8 validation: invalid-input suite (F5, F6)", () => {
  it("ignores retained numeric values of unknown-tier before/after inputs", () => {
    for (const id of ["error_count_before", "error_count_after"]) {
      const form = goldenResultForm();
      form.inputs.find((input) => input.id === "error_count_before")!.value = 5;
      form.inputs.find((input) => input.id === "error_count_after")!.value = 24;
      form.inputs.find((input) => input.id === id)!.tier = "user_unknown";
      expect(
        validateInputs(form).errors.some(
          (error) => error.code === "AFTER_GT_BEFORE",
        ),
      ).toBe(false);
    }
    const known = goldenResultForm();
    known.inputs.find((input) => input.id === "error_count_before")!.value = 5;
    expect(
      validateInputs(known).errors.some(
        (error) => error.code === "AFTER_GT_BEFORE",
      ),
    ).toBe(true);
  });
  const ok = () => simpleForm();

  it("the baseline form is valid", () => {
    expect(validateInputs(goldenResultForm()).ok).toBe(true);
    expect(validateInputs(ok()).errors).toEqual([]);
  });

  const cases: [string, () => LegacyFormFile, string][] = [
    [
      "percent over 100",
      () => setVal(ok(), "recapture_pct", 105),
      "OUT_OF_BOUNDS",
    ],
    ["negative percent", () => setVal(ok(), "recapture_pct", -1), "NEGATIVE"],
    [
      "adoption over 100",
      () => setVal(ok(), "adoption_by_year", [105, 80, 90]),
      "OUT_OF_BOUNDS",
    ],
    ["negative cost", () => setVal(ok(), "cost_annual_run", -5), "NEGATIVE"],
    [
      "count not an integer",
      () => setVal(ok(), "staff_affected", 2.5),
      "NOT_INTEGER",
    ],
    ["horizon 0", () => ({ ...ok(), horizon_years: 0 }), "BAD_HORIZON"],
    ["horizon 21", () => ({ ...ok(), horizon_years: 21 }), "BAD_HORIZON"],
    [
      "delay over 240",
      () => add(ok(), inp("delay_months", 241)),
      "OUT_OF_BOUNDS",
    ],
    [
      "delay not an integer",
      () => add(ok(), inp("delay_months", 1.5)),
      "NOT_INTEGER",
    ],
    [
      "weeks over 52",
      () => setVal(ok(), "weeks_per_year", 53),
      "OUT_OF_BOUNDS",
    ],
    [
      "uplift over 1000",
      () => add(ok(), inp("cost_uplift_pct", 1001)),
      "OUT_OF_BOUNDS",
    ],
    [
      "after greater than before (minutes)",
      () =>
        add(
          drop(ok(), "hours_saved_per_staff_week"),
          inp("minutes_per_task_before", 10),
          inp("minutes_per_task_after", 20),
        ),
      "AFTER_GT_BEFORE",
    ],
    [
      "after greater than before (ARO)",
      () => add(ok(), inp("aro_before", 1), inp("aro_after", 2)),
      "AFTER_GT_BEFORE",
    ],
    [
      "adoption array too short",
      () => setVal(ok(), "adoption_by_year", [50, 80]),
      "BAD_ADOPTION_LENGTH",
    ],
    [
      "adoption array too long",
      () => setVal(ok(), "adoption_by_year", [50, 80, 90, 90]),
      "BAD_ADOPTION_LENGTH",
    ],
    ["unknown id", () => add(ok(), inp("made_up_input", 1)), "UNKNOWN_ID"],
    ["duplicate id", () => add(ok(), inp("staff_affected", 3)), "DUPLICATE_ID"],
    [
      "source_file_id from another project",
      () =>
        add(
          ok(),
          inp("aro_before", 1, "documented", {
            backing: { source_file_id: "other_project_file" },
          }),
        ),
      "FOREIGN_FILE",
    ],
    [
      "self-reported time tagged measured",
      () => ({
        ...ok(),
        inputs: ok().inputs.map((i) =>
          i.id === "hours_saved_per_staff_week"
            ? { ...i, tier: "measured" as const }
            : i,
        ),
      }),
      "SELF_REPORTED_MEASURED",
    ],
    [
      "null essential cost",
      () => setVal(ok(), "cost_annual_run", null),
      "MISSING_ESSENTIAL_COST",
    ],
    [
      "absent essential cost",
      () => drop(ok(), "cost_one_time_vendor_license"),
      "MISSING_ESSENTIAL_COST",
    ],
    [
      "text where a number is expected",
      () => setVal(ok(), "weeks_per_year", "forty"),
      "TYPE_MISMATCH",
    ],
    [
      "NaN value",
      () => setVal(ok(), "weeks_per_year", Number.NaN),
      "TYPE_MISMATCH",
    ],
    ["no goals", () => ({ ...ok(), goals: [] }), "NO_GOALS"],
    [
      "missing horizon",
      () => ({ ...ok(), horizon_years: undefined }),
      "MISSING_SETTING",
    ],
    ["bad enum", () => add(ok(), inp("cost_nature", "maybe")), "BAD_ENUM"],
    [
      "bad tier",
      () => add(ok(), { id: "aro_before", value: 1, tier: "great" as never }),
      "BAD_TIER",
    ],
  ];
  for (const [name, make, code] of cases) {
    it(`rejects: ${name} -> ${code}`, () => {
      expect(codes(make())).toContain(code);
    });
  }

  it("backing on a known input and basis on a non-cost input are ignored with a warning", () => {
    const f = add(
      ok(),
      inp("tasks_per_staff_week", 5, "documented", {
        backing: { verified: true },
        basis: "quoted",
      }),
    );
    const r = validateInputs(f);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["BACKING_IGNORED", "BASIS_IGNORED"]),
    );
  });

  it("invalid forms throw EngineValidationError from computeProject; a missing essential cost gives a gap list", () => {
    expect(() =>
      computeProject(setVal(ok(), "recapture_pct", 105), OPTS),
    ).toThrow(EngineValidationError);
    const out = computeProject(setVal(ok(), "cost_annual_run", null), OPTS);
    expect(out.kind).toBe("gap_list");
    expect(
      out.gap_list?.items.some((i) => i.target === "cost_annual_run"),
    ).toBe(true);
    expect(out.result).toBeUndefined();
  });
});

describe("K8 unknown handling (F6): unknown is never zero", () => {
  it("a null effect input drops its driver to unquantified (not zero) and into the gap list", () => {
    const f = setVal(goldenResultForm(), "cost_per_error", null);
    const out = computeProject(f, OPTS);
    expect(out.kind).toBe("result");
    const r = out.result;
    expect(r?.drivers.map((d) => d.id)).not.toContain("data_quality");
    expect(
      r?.unquantified.find((u) => u.target === "data_quality")?.reason,
    ).toContain("cost_per_error");
    // the remaining benefit is unchanged by a phantom zero
    const full = computeProject(goldenResultForm(), OPTS).result;
    const without = full?.drivers
      .filter((d) => d.id !== "data_quality")
      .reduce((s, d) => s + d.total, 0);
    const got = r?.drivers.reduce((s, d) => s + d.total, 0);
    expect(got).toBeCloseTo(without as number, 6);
  });
  it("tier user_unknown never reaches a formula", () => {
    const f = { ...goldenResultForm() };
    f.inputs = f.inputs.map((i) =>
      i.id === "cost_per_error" ? { ...i, tier: "user_unknown" as const } : i,
    );
    const out = computeProject(f, OPTS);
    expect(out.result?.drivers.map((d) => d.id)).not.toContain("data_quality");
  });
  it("a project whose only driver is unknown returns a gap list with the missing input", () => {
    const f = setVal(simpleForm(), "hours_saved_per_staff_week", null);
    const out = computeProject(f, OPTS);
    expect(out.kind).toBe("gap_list");
    expect(out.gap_list?.items[0]?.return_to.screen).toBe("intake");
    expect(out.gap_list?.items.map((i) => i.target)).toContain(
      "hours_saved_per_staff_week",
    );
  });
  it("missing optional fields are fine; an unknown optional cost is warned, not zeroed", () => {
    const f = add(simpleForm(), {
      ...cost("cost_training_change", 0),
      value: null,
    });
    const out = computeProject(f, OPTS);
    expect(out.kind).toBe("result");
    expect(out.result?.warnings.map((w) => w.code)).toContain(
      "OPTIONAL_COST_UNKNOWN",
    );
  });
});
