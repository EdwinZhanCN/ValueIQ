import { describe, expect, it } from "vitest";
import { ale, ruleOfTenCost } from "../drivers";
import { computeProject } from "../project";
import type { EngineConfig, FormFile, Input, RunOutput } from "../types";
import { OPTS, cost, inp } from "./forms";

type Cfg = Partial<EngineConfig>;
function run(form: FormFile, config?: Cfg): RunOutput {
  return computeProject(form, { ...OPTS, ...(config ? { config } : {}) });
}
function step(out: RunOutput, driver: string, name: string): number {
  const d = out.result?.drivers.find((x) => x.id === driver);
  const s = d?.steps.find((x) => x.name === name);
  if (!s) throw new Error(`no step ${driver}/${name}`);
  return s.value;
}
const near = (a: number, b: number, tol = 0.005) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

// test config: documented band fixed at the given haircut, relaxed project floor
const withHaircut = (h: number): Cfg => ({
  bands: {
    measured: [0, 0],
    documented: [h, h],
    benchmark: [0.1, 0.25],
    estimate: [0.25, 0.4],
    assumption: [0.4, 0.6],
  },
  project_floor: 0.75,
});

describe("K3 driver formulas exact (T7, T8)", () => {
  it("Sprint 4: $100,000 gross, $50,000, $25,000, $20,000; NPV 8,181.82 at 10% and 9,417.48 at 3%", () => {
    const form: FormFile = {
      goals: ["time_savings"],
      currency: "USD",
      horizon_years: 1,
      inputs: [
        inp("discount_rate_pct", 10, "benchmark"),
        inp("adoption_by_year", [50], "estimate"),
        inp("staff_affected", 10),
        inp("hours_saved_per_staff_week", 5, "documented"),
        inp("weeks_per_year", 40),
        inp("loaded_hourly_cost", 50),
        inp("recapture_pct", 50, "benchmark"),
        inp("cost_uplift_pct", 0, "documented"),
        cost("cost_one_time_vendor_license", 10000),
        cost("cost_annual_run", 0),
      ],
    };
    const out = run(form, withHaircut(0.2));
    expect(out.kind).toBe("result");
    near(step(out, "time_savings", "gross"), 100000);
    near(step(out, "time_savings", "adoption"), 50000);
    near(step(out, "time_savings", "recapture"), 25000);
    near(step(out, "time_savings", "haircut"), 20000);
    near(out.result?.headline.npv.capacity_inclusive as number, 8181.82);
    const at3 = out.result?.sensitivity.discount_rate.find((p) => p.x === 3);
    near(at3?.npv_capacity_inclusive as number, 9417.48);
    // hard and capacity separate: no cash reduction => no hard NPV
    expect(out.result?.headline.npv.hard).toBeNull();
  });

  it("minutes-based time savings give the same gross", () => {
    const form: FormFile = {
      goals: ["time_savings"],
      currency: "USD",
      horizon_years: 1,
      inputs: [
        inp("discount_rate_pct", 10, "benchmark"),
        inp("adoption_by_year", [100], "estimate"),
        inp("staff_affected", 10),
        inp("minutes_per_task_before", 30, "documented"),
        inp("minutes_per_task_after", 20, "documented"),
        inp("tasks_per_staff_week", 30),
        inp("weeks_per_year", 40),
        inp("loaded_hourly_cost", 50),
        inp("recapture_pct", 100, "benchmark"),
        cost("cost_one_time_vendor_license", 1),
        cost("cost_annual_run", 0),
      ],
    };
    // 10 staff x (30-20) min x 30 tasks / 60 = 50 hours/week; x 40 x 50 = 100,000
    near(step(run(form, withHaircut(0)), "time_savings", "gross"), 100000);
  });

  it("Rule of Ten: 62 x $1 + 38 x $10 = $442, and the incremental error cost feeds the driver", () => {
    expect(ruleOfTenCost(62, 38, 1, 10)).toBe(442);
    const form: FormFile = {
      goals: ["data_quality"],
      currency: "USD",
      horizon_years: 1,
      inputs: [
        inp("discount_rate_pct", 10, "benchmark"),
        inp("adoption_by_year", [100], "estimate"),
        inp("error_count_before", 38, "documented"),
        inp("error_count_after", 0, "documented"),
        inp("cost_per_clean_unit", 1),
        inp("error_cost_multiplier", 10, "benchmark"),
        cost("cost_one_time_vendor_license", 1),
        cost("cost_annual_run", 0),
      ],
    };
    // 38 errors x $1 x (10 - 1) = 342; 342 + 100 clean-unit base = 442 total handling cost
    near(step(run(form, withHaircut(0)), "data_quality", "gross"), 342);
  });

  it("ALE: $100,000 x 25% = $25,000 per event, ARO 3 gives $75,000", () => {
    expect(ale(3, 100000 * 0.25)).toBe(75000);
    const form: FormFile = {
      goals: ["risk_reduction"],
      currency: "USD",
      horizon_years: 1,
      inputs: [
        inp("discount_rate_pct", 10, "benchmark"),
        inp("adoption_by_year", [100], "estimate"),
        inp("aro_before", 3, "documented"),
        inp("aro_after", 0, "documented"),
        inp("asset_value", 100000, "documented"),
        inp("exposure_factor_pct", 25, "documented"),
        cost("cost_one_time_vendor_license", 1),
        cost("cost_annual_run", 0),
      ],
    };
    near(step(run(form, withHaircut(0)), "risk_reduction", "gross"), 75000);
  });

  it("Priya components: $59,371 / $24,840 / $152,400 / $22,860 and cost PV about $209,249", () => {
    const form: FormFile = {
      goals: ["time_savings", "data_quality"],
      currency: "USD",
      horizon_years: 3,
      file_descriptions: { f1: "log" },
      inputs: [
        inp("discount_rate_pct", 10, "benchmark"),
        inp("adoption_by_year", [60, 85, 90], "estimate"),
        inp("staff_affected", 14),
        inp("hours_saved_per_staff_week", 5, "documented"),
        inp("weeks_per_year", 48),
        inp("loaded_hourly_cost", 62),
        inp("recapture_pct", 50, "benchmark"),
        inp("error_count_before", 72, "measured", {
          origin: "file",
          backing: { source_file_id: "f1", quote_confirmed: true },
        }),
        inp("error_count_after", 24, "measured", {
          origin: "file",
          backing: { source_file_id: "f1", quote_confirmed: true },
        }),
        inp("cost_per_error", 690, "measured", {
          origin: "file",
          backing: { source_file_id: "f1", quote_confirmed: true },
        }),
        inp("cost_nature", "cash"),
        inp("cost_uplift_pct", 27, "documented"),
        cost("cost_one_time_vendor_license", 120000),
        cost("cost_annual_run", 18000),
      ],
    };
    // documented band fixed at 5% => time savings x 0.95; expedite haircut 0 but adoption 75% in the source:
    // the engine applies the stated adoption path, so check the components that do not depend on it
    const out = run(form, withHaircut(0.05));
    const r = out.result;
    near(
      r?.costs.lines.find((l) => l.id === "cost_one_time_vendor_license")
        ?.adjusted as number,
      152400,
    );
    near(
      r?.costs.lines.find((l) => l.id === "cost_annual_run")
        ?.adjusted as number,
      22860,
    );
    const g = step(out, "time_savings", "gross"); // 14 x 5 x 48 x 62
    near(g / 3, 208320);
    const ts = r?.drivers.find((d) => d.id === "time_savings");
    near(ts?.annual[0]?.benefit as number, 59371, 0.5); // year 1: gross x 60% x 50% x 95%
    near(step(out, "data_quality", "gross") / 3, 33120);
    // expedite line at the 75% adoption used in the source: 33,120 x 0.75 = 24,840
    const dqForm: FormFile = {
      ...form,
      goals: ["data_quality"],
      horizon_years: 1,
      inputs: form.inputs.map((i) =>
        i.id === "adoption_by_year" ? { ...i, value: [75] } : i,
      ),
    };
    const dq = run(dqForm, withHaircut(0.05)).result?.drivers[0];
    near(dq?.annual[0]?.benefit as number, 24840);
    near(
      r?.costs.total_pv as number,
      152400 + 22860 * (1 / 1.1 + 1 / 1.21 + 1 / 1.331),
      1e-6,
    );
    near(r?.costs.total_pv as number, 209249, 1);
  });

  it("decision speed and the cost-of-delay label by basis", () => {
    const mk = (basis: string): Input[] => [
      inp("decisions_per_year", 10),
      inp("days_to_decide_before", 10, "documented"),
      inp("days_to_decide_after", 5, "documented"),
      inp("cost_of_delay_per_day", 200, "documented"),
      inp("cost_of_delay_basis", basis),
    ];
    const base = (basis: string): FormFile => ({
      goals: ["decision_speed"],
      currency: "USD",
      horizon_years: 1,
      inputs: [
        inp("discount_rate_pct", 10, "benchmark"),
        inp("adoption_by_year", [100], "estimate"),
        ...mk(basis),
        cost("cost_one_time_vendor_license", 1),
        cost("cost_annual_run", 0),
      ],
    });
    const o = run(base("revenue_deferred"), withHaircut(0));
    near(step(o, "decision_speed", "gross"), 10 * 5 * 200);
    expect(o.result?.drivers[0]?.label_class).toBe("incremental_profit");
    expect(
      run(base("risk_exposure"), withHaircut(0)).result?.drivers[0]
        ?.label_class,
    ).toBe("avoided_loss");
  });
});
