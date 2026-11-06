import type { EngineConfig } from "./types";

// All numbers here are team judgment (ROI.md 3.7, 11.2, 12.2), kept as config values.
export const DEFAULT_CONFIG: EngineConfig = {
  bands: {
    measured: [0, 0],
    documented: [0, 0.1],
    benchmark: [0.1, 0.25],
    estimate: [0.25, 0.4],
    assumption: [0.4, 0.6],
  },
  weights: {
    source: 0.25,
    corroborated: 0.2,
    coverage: 0.2,
    recent: 0.1,
    tight_range: 0.15,
    verified: 0.1,
  },
  corroboration_tolerance: 0.2,
  tight_range_tolerance: 0.2,
  coverage_observations: 30,
  coverage_months: 12,
  recency_months: 12,
  cost_uplift_pct: { quoted: 15, estimated: 30, assumed: 50 },
  driver_floors: {
    time_savings: 0.8,
    data_quality: 0.8,
    decision_speed: 0.85,
    risk_reduction: 0.85,
  },
  project_floor: 0.85,
  big_driver_share: 0.3,
  scenario: {
    adoption_mult: { conservative: 0.85, optimistic: 1.1 },
    recapture_delta_pts: { conservative: -10, optimistic: 10 },
  },
  sensitivity: {
    discount_rates_pct: [3, 5, 8, 10, 12, 15],
    adoption_mults: [0.6, 0.8, 1.0, 1.1],
    extra_haircut_pts: [0, 5, 10, 15],
  },
  guardrails: {
    driver_share: 0.5,
    vendor_share: 0.5,
    assumption_share: 0.25,
    npv_flip_points: 3,
  },
  versions: { contract: "1", formula: "0.1", settings: "s1" },
};

export function mergeConfig(over?: Partial<EngineConfig>): EngineConfig {
  if (!over) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...over,
    bands: { ...DEFAULT_CONFIG.bands, ...over.bands },
    weights: { ...DEFAULT_CONFIG.weights, ...over.weights },
    cost_uplift_pct: {
      ...DEFAULT_CONFIG.cost_uplift_pct,
      ...over.cost_uplift_pct,
    },
    driver_floors: { ...DEFAULT_CONFIG.driver_floors, ...over.driver_floors },
    scenario: { ...DEFAULT_CONFIG.scenario, ...over.scenario },
    sensitivity: { ...DEFAULT_CONFIG.sensitivity, ...over.sensitivity },
    guardrails: { ...DEFAULT_CONFIG.guardrails, ...over.guardrails },
    versions: { ...DEFAULT_CONFIG.versions, ...over.versions },
  };
}
