import { beforeEach, describe, expect, it } from "vitest";
import {
  getProject,
  getProjectForm,
  saveProjectForm,
} from "../projects.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";

let t: TestD1;
let ids: ReturnType<typeof seedTeams>;

beforeEach(() => {
  t = createTestD1();
  env.DB = t.d1;
  ids = seedTeams(t);
});

const tick = () => new Promise((r) => setTimeout(r, 2));

describe("saveProjectForm edit-conflict check", () => {
  it("a first save expecting no form lands; a second one expecting none is stale", async () => {
    const a = await saveProjectForm("p1", { n: 1 }, ids.owner, null);
    expect(a.ok).toBe(true);
    const b = await saveProjectForm("p1", { n: 2 }, ids.member, null);
    expect(b).toEqual({ ok: false, reason: "stale" });
    expect((await getProjectForm("p1"))?.formJson).toEqual({ n: 1 });
  });

  it("a save based on the current version lands; one based on an older version is stale", async () => {
    await saveProjectForm("p1", { n: 1 }, ids.owner);
    const loaded = (await getProjectForm("p1"))!.updatedAt;
    await tick();
    // Owner and member both opened `loaded`; the member saves first.
    const member = await saveProjectForm("p1", { n: 2 }, ids.member, loaded);
    expect(member.ok).toBe(true);
    await tick();
    const owner = await saveProjectForm("p1", { n: 3 }, ids.owner, loaded);
    expect(owner).toEqual({ ok: false, reason: "stale" });
    const saved = await getProjectForm("p1");
    expect(saved?.formJson).toEqual({ n: 2 });
    expect(saved?.updatedBy).toBe(ids.member);
  });

  it("without a base version the save overwrites (scripted clients)", async () => {
    await saveProjectForm("p1", { n: 1 }, ids.owner);
    await tick();
    expect((await saveProjectForm("p1", { n: 2 }, ids.member)).ok).toBe(true);
    expect((await getProjectForm("p1"))?.formJson).toEqual({ n: 2 });
  });
});

describe("saveProjectForm keeps project goals in step with the form", () => {
  it("a form with goals sets projects.goals", async () => {
    await saveProjectForm("p1", { goals: ["time_savings"] }, ids.owner, null);
    expect((await getProject("p1"))?.goals).toEqual(["time_savings"]);
  });

  it("a form without goals leaves projects.goals alone", async () => {
    await saveProjectForm("p1", { goals: ["risk_reduction"] }, ids.owner);
    await tick();
    await saveProjectForm("p1", { draft: true }, ids.owner);
    expect((await getProject("p1"))?.goals).toEqual(["risk_reduction"]);
  });

  it("a stale save does not change projects.goals", async () => {
    await saveProjectForm("p1", { goals: ["data_quality"] }, ids.owner, null);
    await tick();
    await saveProjectForm("p1", { goals: ["time_savings"] }, ids.member, null);
    expect((await getProject("p1"))?.goals).toEqual(["data_quality"]);
  });
});
