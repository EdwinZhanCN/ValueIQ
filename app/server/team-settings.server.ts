import { and, desc, eq, lte, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { projects, teamSettings, user } from "../../db/schema";
import { mergeConfig } from "../../engine/config";
import type { EngineConfig } from "../../engine/types";
import {
  RATIONALE_MAX,
  SOURCE_MAX,
  STARTING_SOURCES,
  STARTING_VALUES,
  STARTING_VERSION,
  TEAM_SETTING_KEYS,
  parseSettingValue,
  settingsVersion,
  type OfferedDefault,
  type OfferedDefaults,
  type TeamSettingKey,
  type TeamSettingValues,
} from "../../shared/team-settings";

/** One key's effective value and where it came from. */
export type EffectiveSetting<K extends TeamSettingKey = TeamSettingKey> = {
  key: K;
  value: TeamSettingValues[K];
  rationale: string | null;
  source: string | null;
  /** True for a starting value (seeded at team creation, or no row at all). */
  starting: boolean;
  setByName: string | null;
  effectiveFrom: string | null;
};

export type TeamSettings = {
  [K in TeamSettingKey]: EffectiveSetting<K>;
};

export function startingSettings(): TeamSettings {
  const out = {} as Record<TeamSettingKey, EffectiveSetting>;
  for (const key of TEAM_SETTING_KEYS)
    out[key] = {
      key,
      value: structuredClone(STARTING_VALUES[key]),
      rationale: null,
      source: STARTING_SOURCES[key],
      starting: true,
      setByName: null,
      effectiveFrom: null,
    };
  return out as TeamSettings;
}

export function valuesOf(settings: TeamSettings): TeamSettingValues {
  return {
    discount_rate_pct: settings.discount_rate_pct.value,
    horizon_years: settings.horizon_years.value,
    recapture_pct: settings.recapture_pct.value,
    cost_uplift_pct: settings.cost_uplift_pct.value,
  };
}

/**
 * The newest row per key that was in effect at `asOf` (default: now). A key
 * with no row yet, or a stored value that no longer parses, falls back to the
 * starting value.
 */
export async function getTeamSettings(
  teamId: string,
  asOf: Date = new Date(),
): Promise<TeamSettings> {
  const rows = await createDb(env.DB)
    .select({
      key: teamSettings.key,
      value: teamSettings.valueJson,
      rationale: teamSettings.rationale,
      source: teamSettings.source,
      setBy: teamSettings.setBy,
      setByName: user.name,
      effectiveFrom: teamSettings.effectiveFrom,
    })
    .from(teamSettings)
    .leftJoin(user, eq(user.id, teamSettings.setBy))
    .where(
      and(
        eq(teamSettings.teamId, teamId),
        lte(teamSettings.effectiveFrom, asOf),
      ),
    )
    .orderBy(desc(teamSettings.effectiveFrom), desc(sql`${teamSettings}.rowid`))
    .all();
  const out = startingSettings() as Record<TeamSettingKey, EffectiveSetting>;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    const key = row.key as TeamSettingKey;
    if (!(TEAM_SETTING_KEYS as readonly string[]).includes(key)) continue;
    const parsed = parseSettingValue(key, row.value);
    if (!parsed.ok) continue;
    out[key] = {
      key,
      value: parsed.value,
      rationale: row.rationale,
      source: row.source,
      starting: row.setBy === null,
      setByName:
        row.setBy === null ? null : (row.setByName ?? "A former member"),
      effectiveFrom: row.effectiveFrom.toISOString(),
    };
  }
  return out as TeamSettings;
}

/** The four starting rows a new team begins with (no author). */
export async function seedTeamSettings(teamId: string): Promise<void> {
  const at = new Date();
  await createDb(env.DB)
    .insert(teamSettings)
    .values(
      TEAM_SETTING_KEYS.map((key) => ({
        id: crypto.randomUUID(),
        teamId,
        key,
        valueJson: STARTING_VALUES[key],
        rationale: null,
        source: STARTING_SOURCES[key],
        setBy: null,
        effectiveFrom: at,
      })),
    )
    .run();
}

export type SetSettingResult =
  { ok: true; setting: EffectiveSetting } | { ok: false; error: string };

/**
 * Appends a new row for one key. The caller has already checked that the user
 * owns the team. A rationale is required; the source is optional.
 */
export async function setTeamSetting(
  teamId: string,
  userId: string,
  key: TeamSettingKey,
  raw: unknown,
  rationale: string,
  source: string,
): Promise<SetSettingResult> {
  const why = rationale.trim();
  if (!why) return { ok: false, error: "Say why the value changes." };
  if (why.length > RATIONALE_MAX)
    return {
      ok: false,
      error: `Keep the rationale under ${RATIONALE_MAX} characters.`,
    };
  const from = source.trim();
  if (from.length > SOURCE_MAX)
    return {
      ok: false,
      error: `Keep the source under ${SOURCE_MAX} characters.`,
    };
  const parsed = parseSettingValue(key, raw);
  if (!parsed.ok) return parsed;
  const at = new Date();
  await createDb(env.DB)
    .insert(teamSettings)
    .values({
      id: crypto.randomUUID(),
      teamId,
      key,
      valueJson: parsed.value,
      rationale: why,
      source: from || null,
      setBy: userId,
      effectiveFrom: at,
    })
    .run();
  const now = await getTeamSettings(teamId, at);
  return { ok: true, setting: now[key] };
}

export async function teamOfProject(projectId: string): Promise<string> {
  const row = await createDb(env.DB)
    .select({ teamId: projects.teamId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!row) throw new Error(`no project ${projectId}`);
  return row.teamId;
}

/** Settings in effect for a run that started at `startedAt`, with its version. */
export async function runSettings(
  teamId: string,
  startedAt: Date,
): Promise<{ settings: TeamSettings; version: string }> {
  const settings = await getTeamSettings(teamId, startedAt);
  return { settings, version: settingsVersion(valuesOf(settings)) };
}

/**
 * What a past run used. Runs recorded as `s1` (every run before team settings,
 * and every run on starting values) used the starting values.
 */
export async function settingsUsedByRun(
  teamId: string,
  run: { started_at: string; settings_version: string },
): Promise<{ settings: TeamSettings; version: string; matches: boolean }> {
  if (run.settings_version === STARTING_VERSION)
    return {
      settings: startingSettings(),
      version: STARTING_VERSION,
      matches: true,
    };
  const { settings, version } = await runSettings(
    teamId,
    new Date(run.started_at),
  );
  return {
    settings,
    version: run.settings_version,
    matches: version === run.settings_version,
  };
}

/**
 * MVP evidence discounts (Eli, Nov 19): an "estimate" cuts a value by 5 to 15% instead of 25 to 40%
 * and a benchmark by 3 to 12% instead of 10 to 25%, so honest estimates can reach the release floors
 * while we measure how accurate the tool is. The engine's own defaults (and the tests that pin them
 * to the published cases) are unchanged; only live runs use these. Revisit after the accuracy review.
 */
const MVP_BANDS: EngineConfig["bands"] = {
  measured: [0, 0],
  documented: [0, 0.1],
  benchmark: [0.03, 0.12],
  estimate: [0.05, 0.15],
  assumption: [0.4, 0.6],
};
export const MVP_FORMULA_VERSION = "0.1-mvp2";

/** The engine configuration for these settings: cost uplift and the version. */
export function engineConfigFor(
  values: TeamSettingValues,
): Partial<EngineConfig> {
  const merged = mergeConfig({
    cost_uplift_pct: { ...values.cost_uplift_pct },
    bands: MVP_BANDS,
    graded_backing: true,
    versions: {
      settings: settingsVersion(values),
      formula: MVP_FORMULA_VERSION,
    } as EngineConfig["versions"],
  });
  return {
    cost_uplift_pct: merged.cost_uplift_pct,
    bands: merged.bands,
    graded_backing: true,
    versions: merged.versions,
  };
}

/** The team's financial defaults as Clarify offers them ("Team default"). */
export async function offeredDefaults(
  teamId: string,
): Promise<OfferedDefaults> {
  const settings = await getTeamSettings(teamId);
  const offer = (key: keyof OfferedDefaults): OfferedDefault => ({
    value: settings[key].value,
    rationale: settings[key].rationale,
    source: settings[key].source,
    starting: settings[key].starting,
  });
  return {
    discount_rate_pct: offer("discount_rate_pct"),
    recapture_pct: offer("recapture_pct"),
    horizon_years: offer("horizon_years"),
  };
}
