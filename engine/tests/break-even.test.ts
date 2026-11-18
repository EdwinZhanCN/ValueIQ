import { describe, expect, it } from "vitest";
import { computeProject } from "../index";
import { goldenResultForm, OPTS } from "./forms";

describe("break-even and coverage (F2, F4)", () => {
  const out = computeProject(goldenResultForm(), OPTS);
  const r = out.result!;

  it("states the level benefit per year that makes NPV zero", () => {
    const b = r.break_even!;
    const annuity = [1, 2, 3].reduce((a, t) => a + 1.1 ** -t, 0);
    expect(b.annual_benefit_needed).toBeCloseTo(
      (r.headline.costs_pv as number) / annuity,
      2,
    );
    expect(b.annual_benefit_modeled).toBeCloseTo(
      (r.headline.benefits_pv as number) / annuity,
      2,
    );
    expect(b.shortfall).toBeCloseTo(
      b.annual_benefit_needed - b.annual_benefit_modeled,
      2,
    );
  });

  it("agrees with the sign of the capacity-inclusive NPV", () => {
    const b = r.break_even!;
    const npv = r.headline.npv.capacity_inclusive as number;
    expect(Math.sign(-b.shortfall)).toBe(Math.sign(npv));
  });

  it("reports every selected goal as in when none is excluded", () => {
    expect(r.coverage!.excluded).toEqual([]);
    expect(r.coverage!.included.length).toBe(r.coverage!.selected.length);
  });
});

describe("tornado from the user's own ranges (F7)", () => {
  it("ranks the input whose low to high range moves NPV most", () => {
    const t = computeProject(goldenResultForm(), OPTS).result!.tornado!;
    expect(t.length).toBeGreaterThan(0);
    expect(t[0]!.input_id).toBe("loss_per_event");
    expect(t[0]!.npv_at_high).toBeGreaterThan(t[0]!.npv_at_low);
    expect(t[0]!.swing).toBeCloseTo(t[0]!.npv_at_high - t[0]!.npv_at_low, 2);
    for (let i = 1; i < t.length; i++)
      expect(t[i - 1]!.swing).toBeGreaterThanOrEqual(t[i]!.swing);
  });

  it("is absent when no input has a range, instead of inventing one", () => {
    const f = goldenResultForm();
    f.inputs = f.inputs.map(({ low: _l, high: _h, ...rest }) => rest);
    expect(computeProject(f, OPTS).result!.tornado).toBeUndefined();
  });
});

describe("program cost split (F5)", () => {
  const withProgram = () => {
    const f = goldenResultForm();
    f.inputs.push({
      id: "cost_annual_program",
      value: 1500,
      tier: "documented",
      origin: "user",
      basis: "quoted",
    });
    return computeProject(f, OPTS).result!;
  };

  it("shows NPV with and without the program spend and warns when nothing values it", () => {
    const r = withProgram();
    expect(r.cost_split!.npv_tool_only).toBeGreaterThan(
      r.cost_split!.npv_with_program,
    );
    expect(r.cost_split!.program_buys_unvalued_outcome).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain(
      "PROGRAM_COST_WITHOUT_BENEFIT",
    );
  });

  it("adds nothing when there is no program cost", () => {
    const r = computeProject(goldenResultForm(), OPTS).result!;
    expect(r.cost_split).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).not.toContain(
      "PROGRAM_COST_WITHOUT_BENEFIT",
    );
  });
});

describe("utilization caps freed time that counts (F6)", () => {
  const run = (util?: number) => {
    const f = goldenResultForm();
    if (util !== undefined)
      f.inputs.push({
        id: "team_utilization_pct",
        value: util,
        tier: "documented",
        origin: "user",
      });
    const r = computeProject(f, OPTS).result!;
    return {
      ts: r.drivers.find((d) => d.id === "time_savings")!.total,
      notes: r.warnings.map((w) => w.message).join(" "),
    };
  };

  it("lowers capacity value for a team with spare capacity, and says why", () => {
    const busy = run();
    const idle = run(25);
    expect(idle.ts).toBeLessThan(busy.ts);
    expect(idle.notes).toMatch(/Team utilization is 25%/);
  });

  it("changes nothing when the team is busier than the recapture share", () => {
    expect(run(90).ts).toBeCloseTo(run().ts, 6);
  });
});
