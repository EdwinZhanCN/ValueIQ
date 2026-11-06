import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { RunOutput } from "../../../engine/types";
import { goldenResultForm } from "../../../engine/tests/forms";
import type { NewRun } from "../../../assistant/run/types";
import { D1RunStore, RunAccessError } from "../run-store.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";

const sample = (f: string) =>
  JSON.parse(readFileSync(`docs/research/samples/${f}`, "utf8")) as RunOutput;
const result = sample("sample-result.json");
const gap = sample("sample-gap-list.json");
const forRun = (source: RunOutput, id: string): RunOutput => ({
  ...structuredClone(source),
  meta: { ...source.meta, run_id: id },
});

const T0 = "2026-11-05T12:00:00.000Z";
const newRun = (
  id: string,
  by: string,
  over: Partial<NewRun> = {},
): NewRun => ({
  id,
  project_id: "p1",
  mode: result.meta.mode,
  form_hash: "h1",
  contract_version: "1",
  formula_version: result.meta.formula_version,
  settings_version: result.meta.settings_version,
  started_by: by,
  started_at: T0,
  form: goldenResultForm(),
  ...over,
});

let t: TestD1;
let ids: ReturnType<typeof seedTeams>;
const as = (userId: string, projectId = "p1") =>
  new D1RunStore({ projectId, userId });

beforeEach(() => {
  t = createTestD1();
  env.DB = t.d1;
  ids = seedTeams(t);
});

describe("D1RunStore access", () => {
  it("lets the owner and a member in, refuses another team", async () => {
    await as(ids.owner).createRun(newRun("r1", ids.owner));
    expect(await as(ids.member).getRun("r1")).toMatchObject({ id: "r1" });
    await expect(as(ids.outsider).getRun("r1")).rejects.toBeInstanceOf(
      RunAccessError,
    );
    await expect(
      as(ids.outsider).createRun(newRun("r2", ids.outsider)),
    ).rejects.toBeInstanceOf(RunAccessError);
  });

  it("refuses a user who left the team (membership is re-read each call)", async () => {
    const s = as(ids.member);
    await s.createRun(newRun("r1", ids.member));
    t.exec("delete from member where user_id = ?", ids.member);
    await expect(s.getRun("r1")).rejects.toBeInstanceOf(RunAccessError);
  });

  it("does not let started_by differ from the calling user", async () => {
    await expect(
      as(ids.member).createRun(newRun("r1", ids.owner)),
    ).rejects.toBeInstanceOf(RunAccessError);
  });

  it("does not show a run through another project's scope", async () => {
    t.exec(
      "insert into projects (id,team_id,name,created_by) values ('p2','t1','P2',?)",
      ids.owner,
    );
    await as(ids.owner).createRun(newRun("r1", ids.owner));
    expect(await as(ids.owner, "p2").getRun("r1")).toBeNull();
    expect(await as(ids.owner, "p2").listRunEvents("r1")).toEqual([]);
  });
});

describe("D1RunStore data", () => {
  it("finds the newest run by project and form hash", async () => {
    const s = as(ids.owner);
    await s.createRun(newRun("r1", ids.owner));
    await s.createRun(
      newRun("r2", ids.owner, { started_at: "2026-11-05T13:00:00.000Z" }),
    );
    await s.createRun(newRun("r3", ids.owner, { form_hash: "h2" }));
    expect((await s.findRunByFormHash("p1", "h1"))?.id).toBe("r2");
    expect(await s.findRunByFormHash("p1", "nope")).toBeNull();
  });

  it("ignores a duplicate (run_id, seq) and keeps events ordered", async () => {
    const s = as(ids.owner);
    await s.createRun(newRun("r1", ids.owner));
    const ev = (seq: number) => ({
      run_id: "r1",
      seq,
      step: null,
      type: "status",
      payload_json: JSON.stringify({ status: "running" }),
      created_at: T0,
    });
    await s.appendRunEvent(ev(2));
    await s.appendRunEvent(ev(1));
    await s.appendRunEvent(ev(1)); // his appendRunEvent ignores a repeated seq
    expect((await s.listRunEvents("r1")).map((e) => e.seq)).toEqual([1, 2]);
  });

  it("stores a result in result_json only and a gap list in gap_list_json only", async () => {
    const s = as(ids.owner);
    await s.createRun(newRun("r1", ids.owner));
    await s.createRun(newRun("r2", ids.owner, { form_hash: "h2" }));
    const a = await s.saveResult("r1", forRun(result, "r1"), T0);
    expect(a.result_json).not.toBeNull();
    expect(a.gap_list_json).toBeNull();
    const b = await s.saveResult("r2", forRun(gap, "r2"), T0);
    expect(b.result_json).toBeNull();
    expect(b.gap_list_json).not.toBeNull();
    // saving is buffered until release; the release stores it once (finishRun)
    await s.updateRun("r1", { status: "released", finished_at: T0 });
    await s.updateRun("r1", { status: "released", finished_at: T0 });
    expect((await s.getResult("r1"))?.result_json).not.toBeNull();
  });

  it("the table CHECK refuses both or neither column", () => {
    as(ids.owner);
    t.exec(
      "insert into runs (id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by) values ('rx','p1','running','real','h','1','1','1',?)",
      ids.owner,
    );
    expect(() =>
      t.exec("insert into run_results (run_id) values ('rx')"),
    ).toThrow();
    expect(() =>
      t.exec(
        "insert into run_results (run_id,result_json,gap_list_json) values ('rx','{}','{}')",
      ),
    ).toThrow();
  });

  it("the table CHECK refuses an unknown status", () => {
    expect(() =>
      t.exec(
        "insert into runs (id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by) values ('rx','p1','bogus','real','h','1','1','1',?)",
        ids.owner,
      ),
    ).toThrow();
  });

  it("cancels only active runs", async () => {
    const s = as(ids.owner);
    await s.createRun(newRun("r1", ids.owner));
    expect((await s.cancel("r1", T0))?.status).toBe("cancelled");
    await s.createRun(newRun("r2", ids.owner, { form_hash: "h2" }));
    await s.saveResult("r2", forRun(gap, "r2"), T0);
    await s.updateRun("r2", { status: "gap_list", finished_at: T0 });
    expect((await s.cancel("r2", T0))?.status).toBe("gap_list");
  });

  it("rebuilds a failed run's error from its error event and serves the latest result", async () => {
    const s = as(ids.owner);
    await s.createRun(newRun("r1", ids.owner));
    await s.appendRunEvent({
      run_id: "r1",
      seq: 1,
      step: "Drivers",
      type: "error",
      payload_json: JSON.stringify({
        code: "MODEL_TIMEOUT",
        message: "Model request timed out",
        retryable: true,
      }),
      created_at: T0,
    });
    const failed = await s.updateRun("r1", {
      status: "failed",
      finished_at: T0,
    });
    expect(failed.error).toEqual({
      code: "MODEL_TIMEOUT",
      message: "Model request timed out",
      retryable: true,
    });
    expect(await s.latestResult()).toBeNull();
    await s.createRun(newRun("r2", ids.owner, { form_hash: "h2" }));
    await s.saveResult("r2", forRun(result, "r2"), T0);
    await s.updateRun("r2", { status: "released", finished_at: T0 });
    const latest = await s.latestResult();
    expect(latest?.run.id).toBe("r2");
    expect(latest?.output.kind).toBe("result");
  });
});
