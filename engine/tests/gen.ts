import type { Backing, DriverId, FormFile, Input, InputTier } from "../types";
import { rng } from "./rng";
import { FILES, cost, inp } from "./forms";

const TIERS: InputTier[] = [
  "measured",
  "documented",
  "benchmark",
  "estimate",
  "assumption",
];

function genBacking(
  r: () => number,
  value: number,
): { backing: Backing; low?: number; high?: number } {
  const b: Backing = {};
  if (r() < 0.5) b.source_file_id = "f1";
  if (r() < 0.5) b.second_source_value = value * (0.7 + r() * 0.6);
  if (r() < 0.5) b.observations = Math.floor(r() * 80);
  if (r() < 0.3) b.period_months = Math.floor(r() * 24);
  if (r() < 0.5) b.source_date = r() < 0.5 ? "2026-08-01" : "2024-01-01";
  if (r() < 0.5) b.verified = true;
  if (r() < 0.3) b.quote_confirmed = true;
  const out: { backing: Backing; low?: number; high?: number } = {
    backing: b,
  };
  if (r() < 0.5) {
    const w = 0.05 + r() * 0.4;
    out.low = value * (1 - w);
    out.high = value * (1 + w);
  }
  return out;
}

function eff(
  r: () => number,
  id: string,
  value: number,
  typedTime = false,
): Input {
  let tier = TIERS[Math.floor(r() * TIERS.length)] as InputTier;
  const g = genBacking(r, value);
  const origin = r() < 0.3 ? "file" : "user";
  if (typedTime && tier === "measured" && origin === "user")
    tier = "documented";
  return {
    id,
    value,
    tier,
    origin,
    backing: g.backing,
    ...(g.low !== undefined ? { low: g.low, high: g.high } : {}),
  };
}

/** A random VALID form: goal combos, horizon 1-20, delay, ramps, all tiers. */
export function genForm(seed: number): FormFile {
  const r = rng(seed);
  const horizon = 1 + Math.floor(r() * 20);
  const all: DriverId[] = [
    "time_savings",
    "data_quality",
    "decision_speed",
    "risk_reduction",
  ];
  const goals: DriverId[] = all.filter(() => r() < 0.6);
  if (goals.length === 0) goals.push(all[Math.floor(r() * 4)] as DriverId);
  const adoption = Array.from({ length: horizon }, () => Math.round(r() * 100));
  const items: Input[] = [
    inp("discount_rate_pct", Math.round(r() * 200) / 10, "benchmark", {
      origin: "default",
    }),
    inp("adoption_by_year", adoption, "estimate"),
    cost(
      "cost_one_time_vendor_license",
      Math.round(r() * 100000),
      r() < 0.5 ? "quoted" : "assumed",
    ),
    cost("cost_annual_run", Math.round(r() * 30000), "estimated"),
  ];
  if (r() < 0.5)
    items.push(
      cost("cost_training_change", Math.round(r() * 10000), "estimated"),
    );
  if (r() < 0.4) items.push(inp("delay_months", Math.floor(r() * 30)));
  if (goals.includes("time_savings")) {
    items.push(
      inp("staff_affected", 1 + Math.floor(r() * 50)),
      eff(
        r,
        "hours_saved_per_staff_week",
        Math.round(r() * 100) / 10 + 0.1,
        true,
      ),
      inp("weeks_per_year", 30 + Math.floor(r() * 22)),
      inp("loaded_hourly_cost", 20 + Math.round(r() * 100)),
      inp("recapture_pct", Math.round(r() * 100), "benchmark", {
        origin: "default",
      }),
    );
    if (r() < 0.3)
      items.push(eff(r, "realized_as_cash", Math.round(r() * 20000)));
  }
  if (goals.includes("data_quality")) {
    const before = 10 + Math.floor(r() * 500);
    items.push(
      eff(r, "error_count_before", before),
      eff(r, "error_count_after", Math.floor(r() * before)),
      eff(r, "cost_per_error", 1 + Math.round(r() * 1000)),
    );
    if (r() < 0.5) items.push(inp("cost_nature", "cash"));
  }
  if (goals.includes("decision_speed")) {
    const before = 1 + Math.round(r() * 30);
    items.push(
      inp("decisions_per_year", 1 + Math.floor(r() * 500)),
      eff(r, "days_to_decide_before", before),
      eff(r, "days_to_decide_after", Math.round(r() * before * 10) / 10),
      eff(r, "cost_of_delay_per_day", 10 + Math.round(r() * 5000)),
      inp(
        "cost_of_delay_basis",
        [
          "revenue_deferred",
          "cost_continuing",
          "risk_exposure",
          "opportunity_lost",
        ][Math.floor(r() * 4)] as string,
      ),
    );
  }
  if (goals.includes("risk_reduction")) {
    const before = (Math.round(r() * 1000) + 10) / 100;
    items.push(
      eff(r, "aro_before", before),
      eff(r, "aro_after", Math.round(r() * before * 100) / 100),
      eff(r, "loss_per_event", 1000 + Math.round(r() * 200000)),
    );
    if (r() < 0.2) items.push(inp("cost_bearer", "customer"));
  }
  return {
    goals,
    currency: "USD",
    horizon_years: horizon,
    file_descriptions: FILES,
    inputs: items,
  };
}

/** Variant where every effect input is documented with strong backing, so the gate passes. */
export function genStrongForm(seed: number): FormFile {
  const f = genForm(seed);
  for (const i of f.inputs) {
    if (i.backing !== undefined) {
      i.tier = "documented";
      i.origin = "user";
      i.backing = {
        source_file_id: "f1",
        observations: 100,
        source_date: "2026-09-30",
        verified: true,
        ...(typeof i.value === "number"
          ? { second_source_value: i.value }
          : {}),
      };
      if (typeof i.value === "number") {
        i.low = i.value * 0.95;
        i.high = i.value * 1.05;
      }
    }
  }
  return f;
}
