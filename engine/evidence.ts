// EVIDENCE LAYER: tier bands, backing score, sliding haircut, weakest link, release gate.
import type { DriverId, EngineConfig, Input, Tier } from "./types";

export const TIER_ORDER: Tier[] = [
  "measured",
  "documented",
  "benchmark",
  "estimate",
  "assumption",
];
export const CHECK_NAMES = [
  "source",
  "corroborated",
  "coverage",
  "recent",
  "tight_range",
  "verified",
] as const;
export type CheckName = (typeof CHECK_NAMES)[number];
export type Checks = Record<CheckName, boolean>;

const EPS = 1e-12;

export interface EvidenceCtx {
  cfg: EngineConfig;
  known_file_ids: ReadonlySet<string>;
  now: Date;
}

/** b = weighted sum of passed checks. */
export function backingScore(
  checks: Partial<Record<CheckName, boolean>>,
  cfg: EngineConfig,
): number {
  let b = 0;
  for (const name of CHECK_NAMES) if (checks[name]) b += cfg.weights[name];
  return b;
}

/** H = H_max - b x (H_max - H_min). Measured is always 0 (its band is [0, 0]). */
export function haircutFor(tier: Tier, b: number, cfg: EngineConfig): number {
  const [lo, hi] = cfg.bands[tier];
  return hi - b * (hi - lo);
}

export function bandOf(tier: Tier, cfg: EngineConfig): [number, number] {
  return cfg.bands[tier];
}

function numeric(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The six checks from the structured Backing fields. A missing field is a failed check. */
export function computeChecks(input: Input, ctx: EvidenceCtx): Checks {
  const { cfg } = ctx;
  const bk = input.backing ?? {};
  const value = numeric(input.value);

  const source =
    typeof bk.source_file_id === "string" &&
    bk.source_file_id.length > 0 &&
    ctx.known_file_ids.has(bk.source_file_id);

  let corroborated = false;
  const second = numeric(bk.second_source_value);
  if (second !== null && value !== null) {
    corroborated =
      Math.abs(second - value) <=
      cfg.corroboration_tolerance * Math.abs(value) + EPS;
  }

  const obs = numeric(bk.observations);
  const months = numeric(bk.period_months);
  const coverage =
    (obs !== null && obs >= cfg.coverage_observations) ||
    (months !== null && months >= cfg.coverage_months);

  let recent = false;
  if (typeof bk.source_date === "string") {
    const t = Date.parse(bk.source_date);
    if (Number.isFinite(t)) {
      const cutoff = new Date(ctx.now.getTime());
      cutoff.setUTCMonth(cutoff.getUTCMonth() - cfg.recency_months);
      recent = t > cutoff.getTime() && t <= ctx.now.getTime();
    }
  }

  let tight = false;
  const lo = numeric(input.low);
  const hi = numeric(input.high);
  if (
    lo !== null &&
    hi !== null &&
    value !== null &&
    lo <= value &&
    value <= hi
  ) {
    const tol = cfg.tight_range_tolerance * Math.abs(value) + EPS;
    tight = value - lo <= tol && hi - value <= tol;
  }

  return {
    source,
    corroborated,
    coverage,
    recent,
    tight_range: tight,
    verified: bk.verified === true,
  };
}

export interface EffectEval {
  id: string;
  stated_tier: Tier;
  tier: Tier; // effective tier after the measured rule
  checks: Checks;
  b: number;
  h_min: number;
  h_max: number;
  h: number;
  c: number;
  vendor_supplied: boolean;
  note: string | null;
}

/**
 * Tier rule: `measured` needs a same-project source file AND a confirmed quote,
 * and is never allowed for typed (origin user) time savings. Otherwise the stated
 * tier is not trusted: it is reduced to `documented` and the reason is recorded.
 * The engine never upgrades a tier by itself.
 */
export function effectiveTier(
  input: Input,
  ctx: EvidenceCtx,
  typedTimeSavings: boolean,
): { tier: Tier; note: string | null } {
  const stated = input.tier;
  if (stated === "user_unknown")
    return { tier: "assumption", note: "user_unknown" };
  if (stated !== "measured") return { tier: stated, note: null };
  const bk = input.backing ?? {};
  const hasFile =
    typeof bk.source_file_id === "string" &&
    ctx.known_file_ids.has(bk.source_file_id);
  if (typedTimeSavings && input.origin !== "file") {
    return {
      tier: "documented",
      note: "Typed or self-reported time savings can never be measured; treated as documented.",
    };
  }
  if (!hasFile || bk.quote_confirmed !== true) {
    return {
      tier: "documented",
      note: "Measured needs a same-project source file and a confirmed quote; treated as documented.",
    };
  }
  return { tier: "measured", note: null };
}

export function evaluateEffect(
  input: Input,
  ctx: EvidenceCtx,
  typedTimeSavings = false,
): EffectEval {
  const { tier, note } = effectiveTier(input, ctx, typedTimeSavings);
  const checks = computeChecks(input, ctx);
  const b = backingScore(checks, ctx.cfg);
  const [h_min, h_max] = ctx.cfg.bands[tier];
  const h = haircutFor(tier, b, ctx.cfg);
  return {
    id: input.id,
    stated_tier: input.tier === "user_unknown" ? "assumption" : input.tier,
    tier,
    checks,
    b,
    h_min,
    h_max,
    h,
    c: 1 - h,
    vendor_supplied: input.vendor_supplied === true,
    note,
  };
}

/** Weakest link: driver haircut is the max, confidence is the min of 1 - H. */
export function driverHaircut(evals: readonly EffectEval[]): number {
  let h = 0;
  for (const e of evals) h = Math.max(h, e.h);
  return h;
}
export function driverConfidence(evals: readonly EffectEval[]): number {
  let c = 1;
  for (const e of evals) c = Math.min(c, e.c);
  return c;
}

// ---------- release gate ----------
export interface GateDriver {
  id: DriverId;
  total: number; // undiscounted adjusted benefit, used as the weight
  confidence: number;
}
export interface GateResult {
  released: boolean;
  included: DriverId[];
  dropped: { id: DriverId; confidence: number; floor: number }[];
  project_confidence: number;
  capped_by?: DriverId;
}

function weighted(drivers: readonly GateDriver[], cfg: EngineConfig) {
  const tot = drivers.reduce((s, d) => s + d.total, 0);
  let cp: number;
  if (tot > 0)
    cp = drivers.reduce((s, d) => s + d.confidence * d.total, 0) / tot;
  else cp = drivers.reduce((s, d) => s + d.confidence, 0) / drivers.length;
  let capped_by: DriverId | undefined;
  if (tot > 0) {
    let minC = Infinity;
    for (const d of drivers) {
      if (d.total / tot > cfg.big_driver_share && d.confidence < minC) {
        minC = d.confidence;
        capped_by = d.id;
      }
    }
    if (capped_by !== undefined && minC < cp) cp = minC;
    else capped_by = undefined;
  }
  return { cp, capped_by };
}

/**
 * Driver enters only if confidence >= its floor. Project confidence = benefit-weighted mean of
 * included drivers, capped by the weakest driver that holds more than 30% of benefit.
 * If no driver is included the reported project confidence is computed over all drivers.
 */
export function releaseGate(
  drivers: readonly GateDriver[],
  cfg: EngineConfig,
): GateResult {
  const included = drivers.filter(
    (d) => d.confidence >= cfg.driver_floors[d.id] - EPS,
  );
  const dropped = drivers
    .filter((d) => !included.includes(d))
    .map((d) => ({
      id: d.id,
      confidence: d.confidence,
      floor: cfg.driver_floors[d.id],
    }));
  if (drivers.length === 0) {
    return { released: false, included: [], dropped, project_confidence: 0 };
  }
  const basis = included.length > 0 ? included : drivers;
  const { cp, capped_by } = weighted(basis, cfg);
  const released = included.length > 0 && cp >= cfg.project_floor - EPS;
  return {
    released,
    included: included.map((d) => d.id),
    dropped,
    project_confidence: cp,
    ...(capped_by !== undefined ? { capped_by } : {}),
  };
}

// ---------- gap-list options ----------
export interface GapOption {
  what_to_add: string;
  new_c: number; // this input's confidence if the option is done
}

/** Ways an effect input could be better backed, with the confidence each would reach. */
export function gapOptions(e: EffectEval, cfg: EngineConfig): GapOption[] {
  const out: GapOption[] = [];
  out.push({
    what_to_add:
      "Attach a time sample or system log and confirm the quoted passage (a typed estimate cannot be treated as measured)",
    new_c: 1,
  });
  const small: CheckName[] = (["corroborated", "verified"] as const).filter(
    (n) => !e.checks[n],
  );
  if (small.length > 0) {
    let b = e.b;
    for (const n of small) b += cfg.weights[n];
    const [lo, hi] = cfg.bands[e.tier];
    out.push({
      what_to_add:
        small.length === 2
          ? "Add a second independent source and have a reviewer verify the figure"
          : small[0] === "corroborated"
            ? "Add a second independent source within 20% of the figure"
            : "Have a reviewer or data owner verify the figure",
      new_c: 1 - (hi - Math.min(1, b) * (hi - lo)),
    });
  }
  return out.filter((o) => o.new_c > e.c + EPS);
}
