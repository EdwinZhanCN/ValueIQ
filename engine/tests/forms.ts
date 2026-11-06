import type {
  Backing,
  CostBasis,
  LegacyFormFile,
  Input,
  InputTier,
} from "../types";

export const NOW = "2026-11-05T12:00:00Z";
export const OPTS = {
  run_id: "run_test",
  generated_at: NOW,
  mode: "real" as const,
};

export function inp(
  id: string,
  value: Input["value"],
  tier: InputTier = "documented",
  extra: Partial<Input> = {},
): Input {
  return { id, value, tier, origin: "user", ...extra };
}
export function cost(
  id: string,
  value: number,
  basis: CostBasis = "quoted",
): Input {
  return { id, value, tier: "documented", origin: "user", basis };
}

export const BACK = {
  source: { source_file_id: "f1" },
  verified: { verified: true },
  coverage: { observations: 100 },
  recent: { source_date: "2026-09-30" },
} as const;
export function backing(...names: (keyof typeof BACK)[]): Backing {
  return Object.assign({}, ...names.map((n) => BACK[n])) as Backing;
}

export const FILES = { f1: "test file" };

/** The form behind engine/fixtures/sample-result.json. */
export function goldenResultForm(): LegacyFormFile {
  const b3 = backing("source", "verified");
  const dq = backing("source", "coverage", "recent");
  const full = backing("source", "coverage", "recent", "verified");
  return {
    goals: ["time_savings", "data_quality", "risk_reduction"],
    currency: "USD",
    horizon_years: 3,
    file_descriptions: FILES,
    inputs: [
      inp("adoption_by_year", [50, 80, 90], "estimate"),
      inp("staff_affected", 10, "documented"),
      inp("hours_saved_per_staff_week", 5, "documented", { backing: b3 }),
      inp("weeks_per_year", 40, "documented"),
      inp("loaded_hourly_cost", 50, "documented"),
      inp("recapture_pct", 50, "benchmark", {
        origin: "default",
        note: "Nucleus productivity correction factor 0.5",
      }),
      inp("discount_rate_pct", 10, "benchmark", {
        origin: "default",
        note: "Forrester TEI convention (organizations typically 8-16%)",
      }),
      inp("error_count_before", 72, "documented", { backing: dq }),
      inp("error_count_after", 24, "documented", { backing: dq }),
      inp("cost_per_error", 690, "documented", { backing: dq }),
      inp("cost_nature", "cash", "documented"),
      inp("aro_before", 3, "documented", { backing: b3 }),
      inp("aro_after", 1.5, "documented", { backing: b3 }),
      inp("loss_per_event", 25000, "documented", {
        backing: full,
        low: 22500,
        high: 27500,
      }),
      cost("cost_one_time_vendor_license", 30000, "quoted"),
      cost("cost_training_change", 5000, "estimated"),
      cost("cost_annual_run", 12000, "quoted"),
    ],
  };
}

/** The form behind engine/fixtures/sample-gap-list.json. */
export function goldenGapForm(): LegacyFormFile {
  return {
    goals: ["time_savings"],
    currency: "USD",
    horizon_years: 3,
    file_descriptions: FILES,
    inputs: [
      inp("discount_rate_pct", 10, "benchmark", { origin: "default" }),
      inp("adoption_by_year", [50, 80, 90], "estimate"),
      inp("staff_affected", 10, "documented"),
      inp("hours_saved_per_staff_week", 5, "estimate", {
        backing: backing("recent"),
      }),
      inp("weeks_per_year", 40, "documented"),
      inp("loaded_hourly_cost", 50, "documented"),
      inp("recapture_pct", 50, "benchmark", { origin: "default" }),
      cost("cost_one_time_vendor_license", 30000, "quoted"),
      cost("cost_annual_run", 12000, "quoted"),
    ],
  };
}

/** Minimal valid time-savings form. */
export function simpleForm(
  over: Partial<LegacyFormFile> = {},
  extra: Input[] = [],
): LegacyFormFile {
  const base = goldenResultForm();
  const keep = new Set([
    "discount_rate_pct",
    "adoption_by_year",
    "staff_affected",
    "hours_saved_per_staff_week",
    "weeks_per_year",
    "loaded_hourly_cost",
    "recapture_pct",
    "cost_one_time_vendor_license",
    "cost_annual_run",
  ]);
  return {
    ...base,
    goals: ["time_savings"],
    inputs: [...base.inputs.filter((i) => keep.has(i.id)), ...extra],
    ...over,
  };
}
