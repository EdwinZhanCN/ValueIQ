// One defaults table (the labeled proxies), used by the form and by get_defaults.
// Every default has a source and a tier. Nothing is invented: effect inputs have none.
import type { DriverId, InputTier } from "./types";

export interface DefaultEntry {
  id: string;
  value: number;
  tier: InputTier;
  source: string;
  goals: DriverId[] | "all";
}

export const DEFAULTS: readonly DefaultEntry[] = [
  {
    id: "horizon_years",
    value: 3,
    tier: "assumption",
    source: "Team assumption (matches Priya and Nucleus 3-year practice)",
    goals: "all",
  },
  {
    id: "discount_rate_pct",
    value: 10,
    tier: "benchmark",
    source: "Forrester TEI convention (organizations typically 8-16%)",
    goals: "all",
  },
  {
    id: "weeks_per_year",
    value: 48,
    tier: "assumption",
    source: "Priya / Sprint 1 example; team assumption",
    goals: ["time_savings"],
  },
  {
    id: "recapture_pct",
    value: 50,
    tier: "benchmark",
    source: "Nucleus productivity correction factor 0.5",
    goals: ["time_savings"],
  },
  {
    id: "error_cost_multiplier",
    value: 10,
    tier: "benchmark",
    source: "Redman Rule of Ten",
    goals: ["data_quality"],
  },
];

export function getDefaults(goals: readonly DriverId[]): DefaultEntry[] {
  return DEFAULTS.filter(
    (d) => d.goals === "all" || d.goals.some((g) => goals.includes(g)),
  );
}

export function defaultFor(id: string): DefaultEntry | undefined {
  return DEFAULTS.find((d) => d.id === id);
}
