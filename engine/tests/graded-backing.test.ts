import { describe, expect, it } from "vitest";
import { evaluateEffect } from "../evidence";
import { mergeConfig } from "../config";
import { inp, NOW } from "./forms";

const ctx = (graded: boolean) => ({
  cfg: mergeConfig({ graded_backing: graded }),
  known_file_ids: new Set(["f1"]),
  now: new Date(NOW),
});
const eff = (observations: number, extra = {}) =>
  inp("hours_saved_per_staff_week", 5, "estimate", {
    backing: { observations, ...extra },
    ...extra,
  });

describe("graded backing", () => {
  it("off by default: 20 of 30 observations earns nothing", () => {
    const e = evaluateEffect(eff(20), ctx(false));
    expect(e.b).toBe(0);
  });
  it("on: 20 of 30 observations earns two thirds of the coverage weight", () => {
    const e = evaluateEffect(eff(20), ctx(true));
    expect(e.b).toBeCloseTo(0.2 * (20 / 30), 9);
  });
  it("confidence rises smoothly as evidence accumulates, not in steps", () => {
    const c = [0, 10, 20, 30].map((n) => evaluateEffect(eff(n), ctx(true)).c);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
    expect(new Set(c.map((x) => x.toFixed(4))).size).toBe(4);
  });
  it("a source that is 18 months old earns half the recency weight", () => {
    const e = evaluateEffect(
      inp("hours_saved_per_staff_week", 5, "estimate", {
        backing: { source_date: "2025-05-05" },
      }),
      ctx(true),
    );
    expect(e.b).toBeGreaterThan(0.1 * 0.4);
    expect(e.b).toBeLessThan(0.1 * 0.6);
  });
  it("full evidence still reaches the same top score as before", () => {
    const full = inp("hours_saved_per_staff_week", 5, "estimate", {
      backing: {
        source_file_id: "f1",
        observations: 100,
        source_date: "2026-10-01",
        verified: true,
        second_source_value: 5,
      },
      low: 4.9,
      high: 5.1,
    });
    expect(evaluateEffect(full, ctx(true)).b).toBeCloseTo(1, 9);
    expect(evaluateEffect(full, ctx(false)).b).toBeCloseTo(1, 9);
  });
});
