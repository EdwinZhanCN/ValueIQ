import { describe, expect, it } from "vitest";
import { computeProject } from "../index";
import { inp, cost, backing, OPTS, FILES, goldenResultForm } from "./forms";
import type { FormFile } from "../types";

const full = backing("source", "coverage", "recent", "verified");
function form(over: Record<string, number | undefined> = {}): FormFile {
  const v = (id: string, d: number) => (over[id] === undefined ? d : over[id]);
  return {
    version: 1,
    goals: ["new_clients"],
    currency: "USD",
    horizon_years: 3,
    file_descriptions: FILES,
    other_notes: "",
    measurement_plan: {},
    inputs: [
      inp("adoption_by_year", [100, 100, 100], "estimate"),
      inp("discount_rate_pct", 10, "benchmark", { origin: "default" }),
      inp("leads_reached_per_year", v("leads", 1000)),
      inp("response_rate_pct", v("resp", 5), "documented", { backing: full }),
      inp("close_rate_pct", v("close", 20), "documented", { backing: full }),
      inp("gross_profit_per_customer", v("gp", 4580), "documented", {
        backing: full,
      }),
      ...(over.cap !== undefined
        ? [inp("capacity_cap_customers", over.cap)]
        : []),
      cost("cost_one_time_vendor_license", 1000, "quoted"),
      cost("cost_annual_run", 1800, "quoted"),
    ],
  };
}
const driver = (f: FormFile) =>
  computeProject(f, OPTS).result!.drivers.find((d) => d.id === "new_clients")!;

describe("New clients driver", () => {
  it("values leads x response x close x first-year gross profit", () => {
    // 1000 x 5% x 20% = 10 customers x $4,580 = $45,800 a year before adoption and cut
    const d = driver(form());
    expect(d.steps[0]!.by_year[0]).toBeCloseTo(45800, 2);
    expect(d.label_class).toBe("incremental_profit");
  });

  it("caps new customers at what the team can serve", () => {
    const d = driver(form({ cap: 2 }));
    expect(d.steps[0]!.by_year[0]).toBeCloseTo(2 * 4580, 2);
  });

  it("does not let a cap above the funnel change anything", () => {
    expect(driver(form({ cap: 50 })).steps[0]!.by_year[0]).toBeCloseTo(
      45800,
      2,
    );
  });

  it("will not release a result resting on an estimated response rate", () => {
    const f = form();
    const weak = {
      ...f,
      inputs: f.inputs.map((i) =>
        i.id === "response_rate_pct"
          ? { ...i, tier: "estimate" as const, backing: undefined }
          : i,
      ),
    };
    expect(computeProject(f, OPTS).kind).toBe("result");
    expect(computeProject(weak, OPTS).kind).toBe("gap_list");
  });

  it("reports a missing close rate instead of guessing it", () => {
    const f = form();
    const out = computeProject(
      {
        ...f,
        inputs: f.inputs.filter((i) => i.id !== "close_rate_pct"),
      },
      OPTS,
    );
    expect(
      out.kind === "gap_list" || out.result?.unquantified.length,
    ).toBeTruthy();
  });
});

describe("New clients flows through the whole project result", () => {
  const g = goldenResultForm();
  const form = {
    ...g,
    goals: ["new_clients"],
    inputs: [
      ...g.inputs.filter((i) =>
        ["adoption_by_year", "discount_rate_pct"].includes(i.id),
      ),
      inp("leads_reached_per_year", 240, "documented"),
      inp("response_rate_pct", 5, "documented"),
      inp("close_rate_pct", 20, "documented"),
      inp("gross_profit_per_customer", 5000, "documented"),
      inp("capacity_cap_customers", 12, "documented"),
      cost("cost_one_time_vendor_license", 150, "estimated"),
      cost("cost_annual_run", 3900, "estimated"),
    ],
  } as never;
  const r = computeProject(form, OPTS).result!;
  it("is a driver, counted as incremental profit (not hard savings)", () => {
    const d = r.drivers.find((x) => x.id === "new_clients")!;
    expect(d.label_class).toBe("incremental_profit");
    expect(r.headline.npv.hard).toBeNull();
    expect(r.coverage!.included).toEqual(["new_clients"]);
  });
  it("feeds the scenarios, break-even and the suggested action", () => {
    const s = r.scenarios;
    expect(s.conservative.npv_capacity_inclusive!).toBeLessThan(
      s.optimistic.npv_capacity_inclusive!,
    );
    expect(r.break_even).toBeDefined();
    expect(r.recommendation).toBeDefined();
    expect(r.measurement_plan.new_clients).toBeDefined();
  });
});
