// FINANCE LAYER: pure functions on already-adjusted benefits and costs.
// Convention (ROI.md section 2, Forrester TEI Appendix A): initial cost C0 at time 0
// (undiscounted); flows of year t (t = 1..N) are discounted at year end by (1+r)^t.
import type { CostBasis, Payback } from "./types";

/** Present value of flows[0] = year 1, flows[1] = year 2, ... (year-end discounting). */
export function pv(flows: readonly number[], ratePct: number): number {
  const r = ratePct / 100;
  let total = 0;
  for (let i = 0; i < flows.length; i++) {
    total += (flows[i] ?? 0) / Math.pow(1 + r, i + 1);
  }
  return total;
}

/** Discount factor for year t at ratePct (percent), year-end convention. */
export function discountFactor(t: number, ratePct: number): number {
  return 1 / Math.pow(1 + ratePct / 100, t);
}

/** NPV = -C0 + sum_t (B_t - C_t) / (1+r)^t. */
export function npv(
  c0: number,
  benefits: readonly number[],
  costs: readonly number[],
  ratePct: number,
): number {
  const n = Math.max(benefits.length, costs.length);
  const net: number[] = [];
  for (let i = 0; i < n; i++) net.push((benefits[i] ?? 0) - (costs[i] ?? 0));
  return -c0 + pv(net, ratePct);
}

/** Excel NPV semantics (T4 Example 1): every value discounted from period 1. */
export function excelNpv(ratePct: number, values: readonly number[]): number {
  return pv(values, ratePct);
}

/** PV of all costs: C0 + PV(recurring costs). */
export function pvCosts(
  c0: number,
  costs: readonly number[],
  ratePct: number,
): number {
  return c0 + pv(costs, ratePct);
}

/** Sprint 4 ROI, percent: (sum B - total costs) / total costs. null when total cost is 0. */
export function roiUndiscounted(
  c0: number,
  benefits: readonly number[],
  costs: readonly number[],
): number | null {
  const total = c0 + sum(costs);
  if (total === 0) return null;
  return (100 * (sum(benefits) - total)) / total;
}

/** Forrester / Priya ROI, percent: NPV / PV(costs). null when PV(costs) is 0. */
export function roiPv(
  c0: number,
  benefits: readonly number[],
  costs: readonly number[],
  ratePct: number,
): number | null {
  const c = pvCosts(c0, costs, ratePct);
  if (c === 0) return null;
  return (100 * npv(c0, benefits, costs, ratePct)) / c;
}

/** Under 24 months show months, otherwise years with one decimal. `years` itself stays numeric. */
export function paybackText(years: number): string {
  const months = Math.round(years * 12);
  if (months < 1) return "less than 1 month (uniform-flow assumption)";
  return months < 24
    ? `about ${months} months (uniform-flow assumption)`
    : `${years.toFixed(1)} years (uniform-flow assumption)`;
}

/**
 * Payback: first period where cumulative undiscounted net cash covers C0.
 * Within that period the crossing is interpolated under a uniform-flow assumption.
 */
export function payback(
  c0: number,
  benefits: readonly number[],
  costs: readonly number[],
): Payback {
  let cum = -c0;
  const n = Math.max(benefits.length, costs.length);
  if (cum >= 0) return { years: 0, text: paybackText(0) };
  for (let i = 0; i < n; i++) {
    const net = (benefits[i] ?? 0) - (costs[i] ?? 0);
    if (cum + net >= 0) {
      const years = i + -cum / net;
      return { years, text: paybackText(years) };
    }
    cum += net;
  }
  return { years: null, text: "No payback within the selected horizon" };
}

export interface FinanceSummary {
  pv_benefits: number;
  pv_costs: number;
  npv: number;
  roi_undiscounted_pct: number | null;
  roi_pv_pct: number | null;
  payback: Payback;
}

/** The engine's finance layer as its own function (takes adjusted benefits and costs). */
export function financeSummary(args: {
  c0: number;
  benefits: readonly number[];
  costs: readonly number[];
  rate_pct: number;
}): FinanceSummary {
  const { c0, benefits, costs, rate_pct } = args;
  return {
    pv_benefits: pv(benefits, rate_pct),
    pv_costs: pvCosts(c0, costs, rate_pct),
    npv: npv(c0, benefits, costs, rate_pct),
    roi_undiscounted_pct: roiUndiscounted(c0, benefits, costs),
    roi_pv_pct: roiPv(c0, benefits, costs, rate_pct),
    payback: payback(c0, benefits, costs),
  };
}

/** Cost uplift: base x (1 + uplift). Override (percent) beats the basis default. */
export function upliftedCost(
  base: number,
  basis: CostBasis,
  upliftTable: Record<CostBasis, number>,
  overridePct?: number | null,
): { uplift_pct: number; adjusted: number } {
  const uplift_pct = overridePct ?? upliftTable[basis];
  return { uplift_pct, adjusted: base * (1 + uplift_pct / 100) };
}

/**
 * Delay shifts the first benefit by delay_months. Benefits are per operating year
 * (index 0 = first year of operation); the result is per project year with the same
 * length (benefits pushed beyond the horizon are lost). A part-year delay blends two years.
 */
export function shiftBenefits(
  benefits: readonly number[],
  delayMonths: number,
): number[] {
  const k = Math.floor(delayMonths / 12);
  const f = (delayMonths % 12) / 12;
  const out: number[] = [];
  for (let t = 0; t < benefits.length; t++) {
    const a = t - k >= 0 ? (benefits[t - k] ?? 0) : 0;
    const b = t - k - 1 >= 0 ? (benefits[t - k - 1] ?? 0) : 0;
    out.push((1 - f) * a + f * b);
  }
  return out;
}

export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
