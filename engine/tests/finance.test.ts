import { describe, expect, it } from "vitest";
import {
  discountFactor,
  excelNpv,
  financeSummary,
  npv,
  payback,
  pv,
  pvCosts,
  roiPv,
  roiUndiscounted,
  shiftBenefits,
  upliftedCost,
} from "../finance";
import { DEFAULT_CONFIG } from "../config";

const near = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("K1 published business cases (finance layer)", () => {
  it("T1 Forrester TEI Impact Partnership Cloud", () => {
    const b = [720000, 952000, 1184000];
    const costs = [154728, 262728, 262728];
    const f = financeSummary({ c0: 8030, benefits: b, costs, rate_pct: 10 });
    near(f.pv_benefits, 2330879, 1);
    near(f.pv_costs, 563214, 1);
    near(f.npv, 1767665, 1);
    near(f.roi_pv_pct as number, 313.85, 0.5);
    near(f.roi_undiscounted_pct as number, 315.0, 0.05);
    expect(f.payback.years).not.toBeNull();
    expect(f.payback.years as number).toBeLessThan(1);
  });

  it("T2 Forrester TEI Analytic Partners", () => {
    const b = [3192000, 5355000, 8820000];
    const costs = [925252, 925252, 925252];
    const f = financeSummary({ c0: 42840, benefits: b, costs, rate_pct: 10 });
    near(f.pv_benefits, 13954035, 1);
    near(f.pv_costs, 2343805, 1);
    near(f.npv, 11610230, 1);
    near(f.roi_pv_pct as number, 495.4, 0.5);
  });

  it("T3 Salesloft benefit line: 25% risk adjustment, PV at 10%", () => {
    const raw = [1279688, 1919531, 2303438];
    const published = [959766, 1439648, 1727578];
    raw.forEach((x, i) => near(x * 0.75, published[i] as number, 0.5 + 1e-9));
    near(pv(published, 10), 3360261, 1);
    near(
      pv(
        raw.map((x) => x * 0.75),
        10,
      ),
      3360261,
      1,
    );
  });
});

describe("K2 discounting and NPV convention", () => {
  it("T4 Excel Example 2: initial cost at time 0, later flows discounted", () => {
    const flows = [8000, 9200, 10000, 12000, 14500];
    near(npv(40000, flows, [0, 0, 0, 0, 0], 8), 1922.06, 0.005);
    near(
      npv(
        40000,
        [8000, 9200, 10000, 12000, 14500, 0],
        [0, 0, 0, 0, 0, 9000],
        8,
      ),
      -3749.47,
      0.005,
    );
  });
  it("T4 Excel Example 1: first value discounted one period (the timing variant)", () => {
    near(excelNpv(10, [-10000, 3000, 4200, 6800]), 1188.44, 0.005);
    // our convention keeps the -10,000 undiscounted, so the result is 1.1 times larger
    near(npv(10000, [3000, 4200, 6800], [0, 0, 0], 10), 1188.44 * 1.1, 0.01);
  });
  it("T5 Green Book discount factors at 3.00% to 4 decimals", () => {
    const want: Record<number, number> = {
      1: 0.9709,
      2: 0.9426,
      3: 0.9151,
      4: 0.8885,
      5: 0.8626,
      10: 0.7441,
      20: 0.5537,
    };
    for (const [t, f] of Object.entries(want))
      near(discountFactor(Number(t), 3), f, 5e-5);
  });
  it("T6 Northern Ireland factors at 3.5% and Scheme A/B present values", () => {
    const want = [0.9662, 0.9335, 0.9019, 0.8714, 0.842];
    want.forEach((f, i) => near(discountFactor(i + 1, 3.5), f, 5e-5));
    // annual cost starts in year 0: 51,000 at time 0 (capital + first annual), then 5 x 1,000
    near(pvCosts(51000, [1000, 1000, 1000, 1000, 1000], 3.5), 55515, 1);
    near(pvCosts(20000, [10000, 10000, 10000, 10000, 10000], 3.5), 65150, 1.5);
    near(
      74407 - pvCosts(20000, [10000, 10000, 10000, 10000, 10000], 3.5),
      9257,
      1.5,
    );
  });
});

describe("K1 edge finance (F11)", () => {
  it("zero cost: ROI undefined, net benefit still available", () => {
    expect(roiUndiscounted(0, [100], [0])).toBeNull();
    expect(roiPv(0, [100], [0], 10)).toBeNull();
    near(npv(0, [100], [0], 10), 100 / 1.1, 1e-9);
  });
  it("no payback within the horizon", () => {
    const p = payback(1000, [100, 100], [0, 0]);
    expect(p.years).toBeNull();
    expect(p.text).toBe("No payback within the selected horizon");
  });
  it("interpolates payback under a uniform-flow assumption", () => {
    const p = payback(150, [100, 100, 100], [0, 0, 0]);
    near(p.years as number, 1.5, 1e-12);
    expect(p.text).toContain("uniform-flow");
  });
  it("immediate payback when there is no upfront cost", () => {
    expect(payback(0, [10], [0]).years).toBe(0);
  });
  it("negative NPV is kept as negative", () => {
    expect(npv(1000, [100], [0], 10)).toBeLessThan(0);
  });
  it("delay shifts the first benefit by whole and part years", () => {
    expect(shiftBenefits([10, 20, 30], 0)).toEqual([10, 20, 30]);
    expect(shiftBenefits([10, 20, 30], 12)).toEqual([0, 10, 20]);
    expect(shiftBenefits([10, 20, 30], 6)).toEqual([5, 15, 25]);
    expect(shiftBenefits([10, 20, 30], 36)).toEqual([0, 0, 0]);
  });
  it("cost uplift by basis: quoted 15%, estimated 30%, assumed 50%; override wins", () => {
    const t = DEFAULT_CONFIG.cost_uplift_pct;
    near(upliftedCost(1000, "quoted", t).adjusted, 1150, 1e-9);
    near(upliftedCost(1000, "estimated", t).adjusted, 1300, 1e-9);
    near(upliftedCost(1000, "assumed", t).adjusted, 1500, 1e-9);
    near(upliftedCost(120000, "quoted", t, 27).adjusted, 152400, 1e-9);
  });
});
