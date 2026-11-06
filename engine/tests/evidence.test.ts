import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import {
  CHECK_NAMES,
  TIER_ORDER,
  backingScore,
  computeChecks,
  driverConfidence,
  driverHaircut,
  evaluateEffect,
  haircutFor,
  releaseGate,
  type CheckName,
  type EvidenceCtx,
} from "../evidence";
import { computeProject } from "../project";
import type { DriverId, Input, Tier } from "../types";
import { OPTS, backing, inp, simpleForm } from "./forms";
import { rng } from "./rng";

const cfg = DEFAULT_CONFIG;
const ctx: EvidenceCtx = {
  cfg,
  known_file_ids: new Set(["f1"]),
  now: new Date("2026-11-05T12:00:00Z"),
};
const TIERS = TIER_ORDER;

function combos(): Partial<Record<CheckName, boolean>>[] {
  const out: Partial<Record<CheckName, boolean>>[] = [];
  for (let m = 0; m < 64; m++) {
    const c: Partial<Record<CheckName, boolean>> = {};
    CHECK_NAMES.forEach((n, i) => (c[n] = (m & (1 << i)) !== 0));
    out.push(c);
  }
  return out;
}

describe("K6 haircut model properties", () => {
  it("weights sum to 1 and bands never overlap", () => {
    expect(Object.values(cfg.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(
      1,
      12,
    );
    for (let i = 0; i < TIERS.length - 1; i++) {
      const strong = cfg.bands[TIERS[i] as Tier];
      const weak = cfg.bands[TIERS[i + 1] as Tier];
      expect(strong[1]).toBeLessThanOrEqual(weak[0]); // a weaker tier never gets a smaller haircut
    }
  });

  it("all tiers x all 64 check combinations: in band, measured is 0, monotone in checks", () => {
    for (const tier of TIERS) {
      const [lo, hi] = cfg.bands[tier];
      for (const c of combos()) {
        const b = backingScore(c, cfg);
        const h = haircutFor(tier, b, cfg);
        expect(h).toBeGreaterThanOrEqual(lo - 1e-12);
        expect(h).toBeLessThanOrEqual(hi + 1e-12);
        if (tier === "measured") expect(h).toBe(0);
        for (const n of CHECK_NAMES) {
          if (c[n]) continue;
          const h2 = haircutFor(
            tier,
            backingScore({ ...c, [n]: true }, cfg),
            cfg,
          );
          expect(h2).toBeLessThanOrEqual(h + 1e-12); // adding a passed check never raises H
        }
      }
      expect(haircutFor(tier, 0, cfg)).toBeCloseTo(hi, 12);
      expect(haircutFor(tier, 1, cfg)).toBeCloseTo(lo, 12);
    }
  });

  it("ROI.md examples: benchmark all checks 10%, none 25%; estimate with 0.45 -> 33.25%", () => {
    expect(haircutFor("benchmark", 1, cfg)).toBeCloseTo(0.1, 12);
    expect(haircutFor("benchmark", 0, cfg)).toBeCloseTo(0.25, 12);
    const b = backingScore({ source: true, coverage: true }, cfg);
    expect(b).toBeCloseTo(0.45, 12);
    expect(haircutFor("estimate", b, cfg)).toBeCloseTo(0.3325, 12);
  });

  it("weakest link: driver haircut is the max, confidence the min of 1 - H", () => {
    const a = evaluateEffect(
      inp("aro_before", 1, "documented", {
        backing: backing("source", "verified"),
      }),
      ctx,
    );
    const b = evaluateEffect(inp("aro_after", 1, "estimate"), ctx);
    expect(driverHaircut([a, b])).toBeCloseTo(0.4, 12);
    expect(driverConfidence([a, b])).toBeCloseTo(0.6, 12);
    expect(driverConfidence([a, b])).toBeCloseTo(1 - driverHaircut([a, b]), 12);
  });

  it("each of the six checks reads the structured backing fields", () => {
    const c = (i: Partial<Input>) =>
      computeChecks({ id: "x", value: 100, tier: "estimate", ...i }, ctx);
    expect(c({}).source).toBe(false);
    expect(c({ backing: { source_file_id: "f1" } }).source).toBe(true);
    expect(c({ backing: { source_file_id: "other" } }).source).toBe(false); // other project's file
    expect(c({ backing: { second_source_value: 120 } }).corroborated).toBe(
      true,
    ); // exactly 20%
    expect(c({ backing: { second_source_value: 121 } }).corroborated).toBe(
      false,
    );
    expect(c({ backing: { observations: 30 } }).coverage).toBe(true);
    expect(c({ backing: { observations: 29 } }).coverage).toBe(false);
    expect(c({ backing: { period_months: 12 } }).coverage).toBe(true);
    expect(c({ backing: { period_months: 11 } }).coverage).toBe(false);
    expect(c({ backing: { source_date: "2025-12-01" } }).recent).toBe(true);
    expect(c({ backing: { source_date: "2025-10-01" } }).recent).toBe(false);
    expect(c({ backing: { source_date: "2027-01-01" } }).recent).toBe(false); // future date
    expect(c({ low: 80, high: 120 }).tight_range).toBe(true);
    expect(c({ low: 79, high: 120 }).tight_range).toBe(false);
    expect(c({ low: 80 }).tight_range).toBe(false);
    expect(c({ backing: { verified: true } }).verified).toBe(true);
    expect(Object.values(c({})).every((v) => v === false)).toBe(true); // missing fields fail, never throw
  });

  it("measured needs a same-project file and a confirmed quote; never for typed time savings", () => {
    const m = (i: Partial<Input>, typed = false) =>
      evaluateEffect({ id: "x", value: 1, tier: "measured", ...i }, ctx, typed);
    expect(m({}).tier).toBe("documented");
    expect(m({ backing: { source_file_id: "f1" } }).tier).toBe("documented");
    expect(
      m({ backing: { source_file_id: "f1", quote_confirmed: true } }).tier,
    ).toBe("measured");
    expect(
      m({ backing: { source_file_id: "nope", quote_confirmed: true } }).tier,
    ).toBe("documented");
    expect(
      m(
        {
          origin: "user",
          backing: { source_file_id: "f1", quote_confirmed: true },
        },
        true,
      ).tier,
    ).toBe("documented");
    expect(
      m(
        {
          origin: "file",
          backing: { source_file_id: "f1", quote_confirmed: true },
        },
        true,
      ).tier,
    ).toBe("measured");
    expect(
      m({
        origin: "file",
        backing: { source_file_id: "f1", quote_confirmed: true },
      }).h,
    ).toBe(0);
    // the engine never upgrades by itself
    expect(
      evaluateEffect(
        inp("x", 1, "estimate", {
          backing: { source_file_id: "f1", quote_confirmed: true },
        }),
        ctx,
      ).tier,
    ).toBe("estimate");
  });

  it("property: 5,000 seeded random inputs stay in band", () => {
    const r = rng(6);
    for (let n = 0; n < 5000; n++) {
      const tier = TIERS[Math.floor(r() * 5)] as Tier;
      const c: Partial<Record<CheckName, boolean>> = {};
      for (const k of CHECK_NAMES) c[k] = r() < 0.5;
      const h = haircutFor(tier, backingScore(c, cfg), cfg);
      const [lo, hi] = cfg.bands[tier];
      expect(h >= lo - 1e-12 && h <= hi + 1e-12).toBe(true);
    }
  });
});

describe("K7 gate safety", () => {
  const D = (id: DriverId, total: number, confidence: number) => ({
    id,
    total,
    confidence,
  });

  it("all drivers pass: released", () => {
    const g = releaseGate(
      [D("time_savings", 100, 0.95), D("data_quality", 100, 0.9)],
      cfg,
    );
    expect(g.released).toBe(true);
    expect(g.dropped).toEqual([]);
  });
  it("one driver below its floor is dropped and the headline is still released", () => {
    const g = releaseGate(
      [D("time_savings", 100, 0.97), D("risk_reduction", 50, 0.84)],
      cfg,
    );
    expect(g.included).toEqual(["time_savings"]);
    expect(g.dropped.map((d) => d.id)).toEqual(["risk_reduction"]);
    expect(g.released).toBe(true);
  });
  it("floors are driver specific (0.80 vs 0.85)", () => {
    expect(releaseGate([D("time_savings", 1, 0.8)], cfg).included).toEqual([
      "time_savings",
    ]);
    expect(releaseGate([D("decision_speed", 1, 0.8)], cfg).released).toBe(
      false,
    );
  });
  it("project below 0.85: no release", () => {
    const g = releaseGate([D("time_savings", 100, 0.81)], cfg);
    expect(g.released).toBe(false);
  });
  it("a driver over 30% of benefit caps the project", () => {
    const g = releaseGate(
      [D("time_savings", 40, 0.86), D("data_quality", 60, 1)],
      cfg,
    );
    expect(g.capped_by).toBe("time_savings");
    expect(g.project_confidence).toBeCloseTo(0.86, 12);
    expect(g.released).toBe(true);
    const g2 = releaseGate(
      [D("time_savings", 40, 0.82), D("data_quality", 60, 1)],
      cfg,
    );
    expect(g2.released).toBe(false);
  });
  it("floors and thresholds are config values", () => {
    const loose = {
      ...cfg,
      project_floor: 0.7,
      driver_floors: { ...cfg.driver_floors, time_savings: 0.7 },
    };
    expect(releaseGate([D("time_savings", 1, 0.75)], loose).released).toBe(
      true,
    );
  });
  it("an estimate-tier effect input never reaches the headline (best case 0.75)", () => {
    const strongest = backing("source", "verified", "coverage", "recent");
    const form = simpleForm({}, []);
    form.inputs = form.inputs.map((i) =>
      i.id === "hours_saved_per_staff_week"
        ? {
            ...i,
            tier: "estimate" as const,
            backing: { ...strongest, second_source_value: 5 },
            low: 4.9,
            high: 5.1,
          }
        : i,
    );
    const out = computeProject(form, OPTS);
    expect(out.kind).toBe("gap_list");
    expect(out.result).toBeUndefined();
    expect(out.gap_list?.dropped_drivers[0]?.confidence).toBeCloseTo(0.75, 9);
  });
  it("property: 20,000 seeded random gates never falsely release", () => {
    const r = rng(7);
    const ids: DriverId[] = [
      "time_savings",
      "data_quality",
      "decision_speed",
      "risk_reduction",
    ];
    for (let n = 0; n < 20000; n++) {
      const ds = ids
        .filter(() => r() < 0.6)
        .map((id) => D(id, r() * 1000, 0.5 + r() * 0.5));
      const g = releaseGate(ds, cfg);
      if (!g.released) continue;
      const inc = ds.filter((d) => g.included.includes(d.id));
      expect(inc.length).toBeGreaterThan(0);
      for (const d of inc)
        expect(d.confidence).toBeGreaterThanOrEqual(
          cfg.driver_floors[d.id] - 1e-9,
        );
      expect(g.project_confidence).toBeGreaterThanOrEqual(
        cfg.project_floor - 1e-9,
      );
    }
  });
});
