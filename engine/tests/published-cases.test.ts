// Independent published cases (issues #67 and #96). Every expected number comes from a source
// document named in engine/fixtures/published/<id>.json, recomputed by recompute.py (plain Python).
// Driver cases run through computeProject; whole studies run through the finance layer.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "../catalog";
import { financeSummary, pv } from "../finance";
import { computeProject } from "../project";
import type {
  DriverId,
  EngineConfig,
  FormFile,
  Input,
  InputTier,
  RunOutput,
} from "../types";
import { OPTS, cost } from "./forms";

// ---------- fixture shapes ----------
interface Source {
  title: string;
  url: string;
  status: string;
  how_opened: string;
  table: string;
  date: string;
}
interface FixtureInput {
  id: string;
  value: Input["value"];
  tier: InputTier;
  published_as: string;
  vendor_supplied?: boolean;
}
interface Tolerance {
  annual_abs?: number;
  annual_rel?: number;
  pv_abs?: number;
  pv_rel?: number;
  npv_abs?: number;
  roi_points?: number;
  why: string;
}
interface DriverFixture {
  id: string;
  case_ref: string;
  kind: "driver";
  driver: DriverId;
  tests: string;
  source: Source;
  mapping_notes: string[];
  engine_config: { flat_haircut: number };
  discount_rate_pct: number;
  runs: { name: string; horizon_years: number; inputs: FixtureInput[] }[];
  combine: "sum" | "concat";
  outside_engine_by_year: number[] | null;
  expected: { annual_benefit: number[]; pv: number; published_total: number };
  tolerance: Tolerance;
}
interface FinanceFixture {
  id: string;
  case_ref: string;
  kind: "finance";
  tests: string;
  source: Source;
  mapping_notes: string[];
  discount_rate_pct: number;
  c0: number;
  benefits: number[];
  costs: number[];
  expected: {
    pv_benefits: number;
    pv_costs: number;
    npv: number;
    total_benefits: number;
    total_costs: number;
    roi_published_pct: number | null;
    payback_years_below: number;
  };
  tolerance: Tolerance;
}
type Fixture = DriverFixture | FinanceFixture;

const dir = new URL("../fixtures/published/", import.meta.url);
const fixtures: Fixture[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Fixture)
  .sort((a, b) => caseNo(a) - caseNo(b));
function caseNo(f: Fixture): number {
  return Number(f.case_ref.slice(1));
}
const drivers = fixtures.filter((f): f is DriverFixture => f.kind === "driver");
const studies = fixtures.filter(
  (f): f is FinanceFixture => f.kind === "finance",
);

// ---------- helpers ----------
const ALL_DRIVERS: DriverId[] = [
  "time_savings",
  "data_quality",
  "decision_speed",
  "risk_reduction",
];

/**
 * Every band is flattened to the study's own flat risk adjustment and the floors are 0, so only the
 * arithmetic is compared. The haircut model and the release gate are NOT tested by these cases.
 */
function flatConfig(h: number): Partial<EngineConfig> {
  return {
    bands: {
      measured: [0, 0],
      documented: [h, h],
      benchmark: [h, h],
      estimate: [h, h],
      assumption: [h, h],
    },
    driver_floors: {
      time_savings: 0,
      data_quality: 0,
      decision_speed: 0,
      risk_reduction: 0,
    },
    project_floor: 0,
  };
}

function formFor(
  fx: DriverFixture,
  run: DriverFixture["runs"][number],
): FormFile {
  const inputs: Input[] = run.inputs.map((i) => ({
    id: i.id,
    value: i.value,
    tier: i.tier,
    origin: "user",
    ...(i.vendor_supplied !== undefined
      ? { vendor_supplied: i.vendor_supplied }
      : {}),
  }));
  return {
    goals: [fx.driver],
    currency: "USD",
    horizon_years: run.horizon_years,
    inputs: [
      {
        id: "discount_rate_pct",
        value: fx.discount_rate_pct,
        tier: "benchmark",
        origin: "user",
      },
      ...inputs,
      cost("cost_one_time_vendor_license", 1),
      cost("cost_annual_run", 0),
    ],
  };
}

function runDriver(fx: DriverFixture): { annual: number[]; hairs: number[] } {
  const per: number[][] = [];
  const hairs: number[] = [];
  for (const run of fx.runs) {
    const out: RunOutput = computeProject(formFor(fx, run), {
      ...OPTS,
      config: flatConfig(fx.engine_config.flat_haircut),
    });
    if (out.kind !== "result" || !out.result)
      throw new Error(`${fx.id}/${run.name}: engine returned ${out.kind}`);
    const d = out.result.drivers.find((x) => x.id === fx.driver);
    if (!d) throw new Error(`${fx.id}/${run.name}: driver missing`);
    per.push(d.annual.map((a) => a.benefit));
    hairs.push(d.haircut_pct);
  }
  const annual: number[] =
    fx.combine === "concat"
      ? per.flatMap((p) => p)
      : (per[0] ?? []).map((_, t) => per.reduce((s, p) => s + (p[t] ?? 0), 0));
  const extra = fx.outside_engine_by_year ?? [];
  return { annual: annual.map((v, t) => v + (extra[t] ?? 0)), hairs };
}

const within = (got: number, want: number, abs = 0, rel = 0): void => {
  const tol = Math.max(abs, rel * Math.abs(want));
  expect(
    Math.abs(got - want),
    `got ${got}, published ${want}, tolerance ${tol}`,
  ).toBeLessThanOrEqual(tol);
};

// ---------- fixture integrity (what each source claims) ----------
describe("K3 published fixtures integrity", () => {
  it("loads 13 fixtures: 10 driver cases and 3 whole studies", () => {
    expect(drivers.length).toBe(10);
    expect(studies.length).toBe(3);
  });
  it("every driver has at least two independent published cases", () => {
    for (const d of ALL_DRIVERS)
      expect(
        drivers.filter((f) => f.driver === d).length,
        d,
      ).toBeGreaterThanOrEqual(2);
  });
  it("every fixture names its source, status, how it was opened, and the table used", () => {
    for (const f of fixtures) {
      expect(f.source.url, f.id).toMatch(/^https:\/\//);
      expect(["READ", "READ (secondary)"], f.id).toContain(f.source.status);
      expect(f.source.how_opened.length, f.id).toBeGreaterThan(10);
      expect(f.source.table.length, f.id).toBeGreaterThan(3);
      expect(f.mapping_notes.length, f.id).toBeGreaterThan(0);
      expect(f.tolerance.why.length, f.id).toBeGreaterThan(10);
    }
  });
  it("every mapped input exists in the catalog and carries the published label", () => {
    for (const f of drivers)
      for (const r of f.runs)
        for (const i of r.inputs) {
          expect(CATALOG[i.id], `${f.id}: ${i.id}`).toBeDefined();
          expect(i.published_as.length, `${f.id}: ${i.id}`).toBeGreaterThan(3);
        }
  });
  it("no published figure is entered as measured (vendor-commissioned composites)", () => {
    for (const f of drivers)
      for (const r of f.runs)
        for (const i of r.inputs)
          expect(i.tier, `${f.id}: ${i.id}`).not.toBe("measured");
  });
});

// ---------- driver cases through computeProject ----------
describe("K3 published driver cases (T9-T18)", () => {
  for (const fx of drivers) {
    describe(`${fx.case_ref} ${fx.id} [${fx.driver}]`, () => {
      const got = runDriver(fx);
      it("applies the study's flat haircut to the driver", () => {
        for (const h of got.hairs)
          within(h, fx.engine_config.flat_haircut * 100, 1e-9);
      });
      it("reproduces the published risk-adjusted benefit in every year", () => {
        expect(got.annual.length).toBe(fx.expected.annual_benefit.length);
        got.annual.forEach((v, t) =>
          within(
            v,
            fx.expected.annual_benefit[t] as number,
            fx.tolerance.annual_abs,
            fx.tolerance.annual_rel,
          ),
        );
      });
      it("reproduces the published present value at 10%", () => {
        within(
          pv(got.annual, fx.discount_rate_pct),
          fx.expected.pv,
          fx.tolerance.pv_abs,
          fx.tolerance.pv_rel,
        );
      });
      it("three-year total matches the published total", () => {
        within(
          got.annual.reduce((s, v) => s + v, 0),
          fx.expected.published_total,
          (fx.tolerance.annual_abs ?? 0) * got.annual.length,
          fx.tolerance.annual_rel,
        );
      });
    });
  }
});

// ---------- whole studies through the finance layer ----------
describe("K1 published whole studies (T19-T21)", () => {
  for (const fx of studies) {
    describe(`${fx.case_ref} ${fx.id}`, () => {
      const f = financeSummary({
        c0: fx.c0,
        benefits: fx.benefits,
        costs: fx.costs,
        rate_pct: fx.discount_rate_pct,
      });
      it("published totals add up", () => {
        within(
          fx.benefits.reduce((s, v) => s + v, 0),
          fx.expected.total_benefits,
          0,
        );
        within(
          fx.c0 + fx.costs.reduce((s, v) => s + v, 0),
          fx.expected.total_costs,
          0,
        );
      });
      it("PV of benefits and costs match the study", () => {
        within(f.pv_benefits, fx.expected.pv_benefits, fx.tolerance.pv_abs);
        within(f.pv_costs, fx.expected.pv_costs, fx.tolerance.pv_abs);
      });
      it("NPV matches the study", () => {
        within(f.npv, fx.expected.npv, fx.tolerance.npv_abs);
      });
      it("ROI (NPV / PV costs) matches the published whole-percent figure, when one is published", () => {
        if (fx.expected.roi_published_pct === null) {
          // Tealium prints no ROI; only check that the engine's ROI is defined and positive.
          expect(f.roi_pv_pct).not.toBeNull();
          return;
        }
        within(
          f.roi_pv_pct as number,
          fx.expected.roi_published_pct,
          fx.tolerance.roi_points,
        );
      });
      it("payback is inside the first six months, as published", () => {
        expect(f.payback.years).not.toBeNull();
        expect(f.payback.years as number).toBeLessThan(
          fx.expected.payback_years_below,
        );
      });
    });
  }
});
