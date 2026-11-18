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
