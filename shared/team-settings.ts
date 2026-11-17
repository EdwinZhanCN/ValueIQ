/**
 * Team financial defaults (interim foundation, Phase 5; #88): the four
 * settings a team owner may change, their starting values, ranges and the
 * version a run records. Pure, so the Worker and the browser share it.
 *
 * Rows in `team_settings` are append-only; the effective value of a key is
 * its newest row at a given moment, or the starting value when a team has no
 * row for it (teams created before seeding need no backfill).
 */
import { DEFAULT_CONFIG } from "../engine/config";

export type CostUplift = { quoted: number; estimated: number; assumed: number };

export type TeamSettingValues = {
  discount_rate_pct: number;
  horizon_years: number;
  recapture_pct: number;
  cost_uplift_pct: CostUplift;
};

export type TeamSettingKey = keyof TeamSettingValues;

export const TEAM_SETTING_KEYS = [
  "discount_rate_pct",
  "horizon_years",
  "recapture_pct",
  "cost_uplift_pct",
] as const satisfies readonly TeamSettingKey[];

export const UPLIFT_TIERS = ["quoted", "estimated", "assumed"] as const;

export const TEAM_SETTING_LABELS: Record<TeamSettingKey, string> = {
  discount_rate_pct: "Discount rate",
  horizon_years: "Years to evaluate",
  recapture_pct: "Recapture of freed time",
  cost_uplift_pct: "Cost uplift (quoted / estimated / assumed)",
};

/** The values every run used before team settings existed (engine settings `s1`). */
export const STARTING_VALUES: TeamSettingValues = {
  discount_rate_pct: 10,
  horizon_years: 3,
  recapture_pct: 50,
  cost_uplift_pct: { ...DEFAULT_CONFIG.cost_uplift_pct },
};

export const STARTING_SOURCES: Record<TeamSettingKey, string> = {
  discount_rate_pct: "Forrester TEI convention (organizations typically 8-16%)",
  horizon_years: "Team assumption: 3-year evaluation window",
  recapture_pct: "Nucleus productivity correction factor 0.5",
  cost_uplift_pct:
    "Team judgment (ROI.md 3.7): more uplift for less certain costs",
};

/** The version the engine has always called its default settings. */
export const STARTING_VERSION = DEFAULT_CONFIG.versions.settings;

export const RATIONALE_MAX = 300;
export const SOURCE_MAX = 200;

const RANGES: Record<
  Exclude<TeamSettingKey, "cost_uplift_pct">,
  { min: number; max: number; integer?: boolean; unit: string }
> = {
  discount_rate_pct: { min: 0, max: 100, unit: "%" },
  horizon_years: { min: 1, max: 20, integer: true, unit: " years" },
  recapture_pct: { min: 0, max: 100, unit: "%" },
};
const UPLIFT_RANGE = { min: 0, max: 200 };

export function isTeamSettingKey(key: unknown): key is TeamSettingKey {
  return (TEAM_SETTING_KEYS as readonly unknown[]).includes(key);
}

function inRange(
  raw: unknown,
  r: { min: number; max: number; integer?: boolean },
): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n) || n < r.min || n > r.max) return null;
  if (r.integer && !Number.isInteger(n)) return null;
  return n;
}

export type ParsedSetting =
  | { ok: true; key: TeamSettingKey; value: TeamSettingValues[TeamSettingKey] }
  | { ok: false; error: string };

/**
 * Checks one submitted value (a number, or for cost uplift an object with the
 * three tiers). Values arrive as text from forms, so numeric strings count.
 */
export function parseSettingValue(
  key: TeamSettingKey,
  raw: unknown,
): ParsedSetting {
  if (key === "cost_uplift_pct") {
    const o = (raw ?? {}) as Record<string, unknown>;
    const out: Partial<CostUplift> = {};
    for (const tier of UPLIFT_TIERS) {
      const n = inRange(o[tier], UPLIFT_RANGE);
      if (n === null)
        return {
          ok: false,
          error: `Each cost uplift must be a number from ${UPLIFT_RANGE.min} to ${UPLIFT_RANGE.max}%.`,
        };
      out[tier] = n;
    }
    return { ok: true, key, value: out as CostUplift };
  }
  const r = RANGES[key];
  const n = inRange(raw, r);
  if (n === null)
    return {
      ok: false,
      error: `${TEAM_SETTING_LABELS[key]} must be ${r.integer ? "a whole number" : "a number"} from ${r.min} to ${r.max}${r.unit.trim() === "%" ? "%" : r.unit}.`,
    };
  return { ok: true, key, value: n };
}

/** Shown wherever a setting's value appears: "8%", "3 years", "15 / 30 / 50%". */
export function formatSetting(
  key: TeamSettingKey,
  value: TeamSettingValues[TeamSettingKey],
): string {
  if (key === "cost_uplift_pct") {
    const v = value as CostUplift;
    return `${v.quoted} / ${v.estimated} / ${v.assumed}%`;
  }
  const n = value as number;
  if (key === "horizon_years") return `${n} year${n === 1 ? "" : "s"}`;
  return `${n}%`;
}

function sameValues(a: TeamSettingValues, b: TeamSettingValues): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: TeamSettingValues) {
  return {
    discount_rate_pct: v.discount_rate_pct,
    horizon_years: v.horizon_years,
    recapture_pct: v.recapture_pct,
    cost_uplift_pct: {
      quoted: v.cost_uplift_pct.quoted,
      estimated: v.cost_uplift_pct.estimated,
      assumed: v.cost_uplift_pct.assumed,
    },
  };
}

/**
 * The settings version a run records: `s1` while the values equal the
 * starting values (so earlier runs keep matching), otherwise the first eight
 * hex digits of a hash of the canonical values.
 */
export function settingsVersion(values: TeamSettingValues): string {
  if (sameValues(values, STARTING_VALUES)) return STARTING_VERSION;
  return cyrb53(JSON.stringify(canonical(values)))
    .padStart(8, "0")
    .slice(0, 8);
}

/** Small non-cryptographic hash (the same cyrb53 the assistant logs use). */
function cyrb53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** One team default as Clarify offers it (value plus why). */
export type OfferedDefault = {
  value: number;
  rationale: string | null;
  source: string | null;
  starting: boolean;
};

/** The team defaults Clarify offers; the cost uplift never enters the form. */
export type OfferedDefaults = Record<
  "discount_rate_pct" | "recapture_pct" | "horizon_years",
  OfferedDefault
>;

/** The note an accepted team default carries on its form input. */
export function teamDefaultNote(d: OfferedDefault): string {
  const why = d.rationale ?? d.source ?? "";
  return (why ? `Team default: ${why}` : "Team default").slice(0, 300);
}
