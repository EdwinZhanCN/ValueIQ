// Team financial defaults (#88): append-only rows, effective value per moment,
// the settings version, and its effect on runs. Real Drizzle queries over the
// D1 shim; the run goes through the orchestrator with the scripted model.
import { beforeEach, describe, expect, it } from "vitest";
import { dryFetch } from "../../../assistant/dry-fetch";
import { resolveModels } from "../../../assistant/models";
import {
  RunOrchestrator,
  computeFormHash,
} from "../../../assistant/run/orchestrator";
import { DEFAULT_CONFIG } from "../../../engine/config";
import { NOW, goldenResultForm } from "../../../engine/tests/forms";
import {
  STARTING_VALUES,
  formatSetting,
  parseSettingValue,
  settingsVersion,
  teamDefaultNote,
} from "../../../shared/team-settings";
import { defaultsFor } from "../../lib/intake-fields";
import { D1RunStore } from "../run-store.server";
import { runEngineConfig, startRunRecord } from "../run-wiring.server";
import {
  engineConfigFor,
  getTeamSettings,
  seedTeamSettings,
  setTeamSetting,
  settingsUsedByRun,
  valuesOf,
} from "../team-settings.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";

let t: TestD1;
let ids: ReturnType<typeof seedTeams>;

beforeEach(() => {
  t = createTestD1();
  env.DB = t.d1;
  ids = seedTeams(t);
});

const set = (key: Parameters<typeof setTeamSetting>[2], raw: unknown) =>
  setTeamSetting("t1", ids.owner, key, raw, "Finance sets this", "CFO memo");

/** Cost lines anywhere in an engine output: `{ basis, uplift_pct, adjusted }`. */
function costLines(x: unknown): { basis: string; uplift_pct: number }[] {
  const out: { basis: string; uplift_pct: number }[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.basis === "string" && typeof o.uplift_pct === "number")
        out.push({ basis: o.basis, uplift_pct: o.uplift_pct });
      Object.values(o).forEach(walk);
    }
  };
  walk(x);
  return out;
}

describe("team settings: values and version", () => {
  it("a team without rows gets the starting values, version s1", async () => {
    const s = await getTeamSettings("t1");
    expect(valuesOf(s)).toEqual(STARTING_VALUES);
    expect(s.discount_rate_pct.starting).toBe(true);
    expect(s.discount_rate_pct.source).toMatch(/Forrester/);
    expect(settingsVersion(valuesOf(s))).toBe("s1");
  });

  it("seeded rows read as starting values with no author", async () => {
    await seedTeamSettings("t1");
    const s = await getTeamSettings("t1");
    expect(valuesOf(s)).toEqual(STARTING_VALUES);
    expect(s.recapture_pct.starting).toBe(true);
    expect(s.recapture_pct.setByName).toBeNull();
  });

  it("checks ranges and requires a rationale", async () => {
    expect(parseSettingValue("discount_rate_pct", "120")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/0 to 100%/) as unknown,
    });
    expect(parseSettingValue("horizon_years", "2.5").ok).toBe(false);
    expect(parseSettingValue("horizon_years", "21").ok).toBe(false);
    expect(
      parseSettingValue("cost_uplift_pct", {
        quoted: 20,
        estimated: "x",
        assumed: 50,
      }).ok,
    ).toBe(false);
    expect(
      await setTeamSetting("t1", ids.owner, "discount_rate_pct", "8", " ", ""),
    ).toEqual({ ok: false, error: "Say why the value changes." });
    expect(await set("discount_rate_pct", "120")).toMatchObject({ ok: false });
    // Nothing was written by the refused attempts.
    expect((await getTeamSettings("t1")).discount_rate_pct.value).toBe(10);
  });

  it("appends, never overwrites, and reads by moment", async () => {
    t.exec(
      "insert into team_settings (id,team_id,key,value_json,rationale,source,set_by,effective_from) values ('a','t1','discount_rate_pct','9','First','',?,1000)",
      ids.owner,
    );
    t.exec(
      "insert into team_settings (id,team_id,key,value_json,rationale,source,set_by,effective_from) values ('b','t1','discount_rate_pct','8','Second','',?,2000)",
      ids.owner,
    );
    expect(
      (await getTeamSettings("t1", new Date(500))).discount_rate_pct,
    ).toMatchObject({ value: 10, starting: true });
    expect(
      (await getTeamSettings("t1", new Date(1500))).discount_rate_pct,
    ).toMatchObject({ value: 9, rationale: "First", setByName: "owner" });
    expect(
      (await getTeamSettings("t1", new Date(2500))).discount_rate_pct,
    ).toMatchObject({ value: 8, rationale: "Second", starting: false });
    const count = await t.d1
      .prepare("select count(*) as n from team_settings where team_id = 't1'")
      .first<{ n: number }>();
    expect(count?.n).toBe(2);
    // Another team is not affected.
    expect((await getTeamSettings("t2")).discount_rate_pct.value).toBe(10);
  });

  it("the version follows the values, and returns to s1 with them", () => {
    const changed = { ...STARTING_VALUES, discount_rate_pct: 8 };
    const v = settingsVersion(changed);
    expect(v).toMatch(/^[0-9a-f]{8}$/);
    expect(settingsVersion({ ...changed })).toBe(v);
    expect(settingsVersion(STARTING_VALUES)).toBe("s1");
    expect(
      formatSetting("cost_uplift_pct", STARTING_VALUES.cost_uplift_pct),
    ).toBe("15 / 30 / 50%");
    // The idempotency key is unchanged for s1 and changes with the version.
    const form = goldenResultForm();
    expect(computeFormHash(form)).toBe(computeFormHash(form, "s1"));
    expect(computeFormHash(form, v)).not.toBe(computeFormHash(form));
  });

  it("Clarify offers the team's values as labelled defaults", () => {
    const offered = {
      discount_rate_pct: {
        value: 8,
        rationale: "Board rate",
        source: null,
        starting: false,
      },
      recapture_pct: {
        value: 50,
        rationale: null,
        source: "Nucleus",
        starting: true,
      },
      horizon_years: {
        value: 5,
        rationale: "Longer",
        source: null,
        starting: false,
      },
    };
    const d = defaultsFor(offered);
    expect(d.discount_rate_pct).toMatchObject({
      value: 8,
      origin: "default",
      note: "Team default: Board rate",
      team: { rationale: "Board rate" },
    });
    expect(d.recapture_pct!.note).toBe("Team default: Nucleus");
    // Built-in defaults stay as they were.
    expect(d.weeks_per_year).toEqual(defaultsFor().weeks_per_year);
    expect(defaultsFor().discount_rate_pct!.team).toBeUndefined();
    expect(teamDefaultNote(offered.horizon_years)).toBe("Team default: Longer");
  });
});

describe("team settings: runs", () => {
  it("a settings change gives the same form a new run with the new version", async () => {
    const caller = { userId: ids.owner, projectId: ids.projectId };
    const form = goldenResultForm();
    const first = await startRunRecord(caller, form);
    expect(first.run.settings_version).toBe("s1");
    // The same form and settings: the active run is returned.
    expect((await startRunRecord(caller, form)).created).toBe(false);

    await set("cost_uplift_pct", { quoted: 20, estimated: 30, assumed: 50 });
    const second = await startRunRecord(caller, form);
    expect(second.created).toBe(true);
    expect(second.run.settings_version).toMatch(/^[0-9a-f]{8}$/);
    expect(second.run.form_hash).not.toBe(first.run.form_hash);

    const store = new D1RunStore(caller);
    const config = await runEngineConfig(store, ids.projectId, second.run.id);
    expect(config.cost_uplift_pct).toEqual({
      quoted: 20,
      estimated: 30,
      assumed: 50,
    });
    expect(config.versions?.settings).toBe(second.run.settings_version);

    // The old run still reads as the starting values.
    const usedBefore = await settingsUsedByRun("t1", first.run);
    expect(usedBefore.version).toBe("s1");
    expect(usedBefore.settings.cost_uplift_pct.value.quoted).toBe(15);
    const usedAfter = await settingsUsedByRun("t1", second.run);
    expect(usedAfter).toMatchObject({ matches: true });
    expect(usedAfter.settings.cost_uplift_pct.value.quoted).toBe(20);
  });

  it("the engine applies the team's cost uplift and records its version", async () => {
    const values = {
      ...STARTING_VALUES,
      cost_uplift_pct: { quoted: 20, estimated: 30, assumed: 50 },
    };
    const config = engineConfigFor(values);
    const run = (withConfig: boolean) => {
      const store = new D1RunStore({
        projectId: ids.projectId,
        userId: ids.owner,
      });
      return new RunOrchestrator({
        store,
        project_id: ids.projectId,
        user_id: ids.owner,
        getForm: () => Promise.resolve(goldenResultForm()),
        apiKey: "test-key",
        models: resolveModels({}),
        fetch: dryFetch(),
        now: () => NOW,
        newRunId: () => crypto.randomUUID(),
        ...(withConfig ? { config } : {}),
      }).startRun();
    };
    const before = await run(false);
    const after = await run(true);
    expect(after.reused).toBe(false);
    expect(before.output?.meta.settings_version).toBe(
      DEFAULT_CONFIG.versions.settings,
    );
    expect(after.output?.meta.settings_version).toBe(settingsVersion(values));
    const quotedBefore = costLines(before.output).filter(
      (l) => l.basis === "quoted",
    );
    const quotedAfter = costLines(after.output).filter(
      (l) => l.basis === "quoted",
    );
    expect(quotedBefore.length).toBeGreaterThan(0);
    expect(quotedBefore.every((l) => l.uplift_pct === 15)).toBe(true);
    expect(quotedAfter.every((l) => l.uplift_pct === 20)).toBe(true);
  });
});
