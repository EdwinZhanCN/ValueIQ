import { beforeEach, describe, expect, it } from "vitest";
import { dryFetch } from "../../../assistant/dry-fetch";
import { resolveModels } from "../../../assistant/models";
import { RunOrchestrator } from "../../../assistant/run/orchestrator";
import { DEFAULT_CONFIG } from "../../../engine/config";
import type { LegacyFormFile } from "../../../engine/types";
import {
  NOW,
  goldenGapForm,
  goldenResultForm,
} from "../../../engine/tests/forms";
import { getRun as getOutputSnapshot } from "../output-runs.server";
import { D1RunStore } from "../run-store.server";
import { env } from "./cf-workers-stub";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";

let t: TestD1;
let ids: ReturnType<typeof seedTeams>;

beforeEach(() => {
  t = createTestD1();
  env.DB = t.d1;
  ids = seedTeams(t);
});

function orchestrator(
  userId: string,
  getForm: () => Promise<LegacyFormFile> = () =>
    Promise.resolve(goldenResultForm()),
) {
  const store = new D1RunStore({ projectId: ids.projectId, userId });
  let n = 0;
  const orch = new RunOrchestrator({
    store,
    project_id: ids.projectId,
    user_id: userId,
    getForm,
    apiKey: "test-key",
    models: resolveModels({}),
    fetch: dryFetch(),
    now: () => NOW,
    newRunId: () => `run-${++n}`,
    checkAccess: async () => {
      try {
        await store.assertAccess();
        return true;
      } catch {
        return false;
      }
    },
  });
  return { orch, store };
}

describe("RunOrchestrator on the D1 store", () => {
  it("runs to released, saves one result row, and is idempotent for the same form", async () => {
    const { orch, store } = orchestrator(ids.member);
    const out = await orch.startRun();
    expect(out.view.status).toBe("released");
    const rec = await store.getRun("run-1");
    expect(rec?.status).toBe("released");
    expect(rec?.started_by).toBe(ids.member);
    const row = await store.getResult("run-1");
    expect(row?.result_json).not.toBeNull();
    expect(row?.gap_list_json).toBeNull();
    const snapshot = await getOutputSnapshot(
      {
        userId: ids.member,
        teamId: "t1",
        projectId: ids.projectId,
        role: "member",
      },
      "run-1",
    );
    expect(snapshot?.output).toEqual(out.output);
    const seqs = (await store.listRunEvents("run-1")).map((e) => e.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));

    const again = await orchestrator(ids.member).orch.startRun();
    expect(again.reused).toBe(true);
    expect(again.run_id).toBe("run-1");
  });

  const pinnedRun = (store: D1RunStore, id: string, form?: LegacyFormFile) =>
    store.createRun({
      id,
      project_id: ids.projectId,
      mode: "real",
      form_hash: "h",
      contract_version: DEFAULT_CONFIG.versions.contract,
      formula_version: DEFAULT_CONFIG.versions.formula,
      settings_version: DEFAULT_CONFIG.versions.settings,
      started_by: ids.owner,
      started_at: NOW,
      form: form ?? goldenResultForm(),
    });

  it("executeRun calculates the form pinned at start, never the live form", async () => {
    // The live form was edited into a gap-list form after the run started.
    const { orch, store } = orchestrator(ids.owner, () =>
      Promise.resolve(goldenGapForm()),
    );
    await pinnedRun(store, "run-7", goldenResultForm());
    const out = await orch.executeRun("run-7");
    expect(out.view.status).toBe("released");
    expect(await store.getRunForm("run-7")).toEqual(goldenResultForm());
  });

  it("executeRun refuses a run without a pinned form", async () => {
    const { orch } = orchestrator(ids.owner);
    // A row from before form_json existed.
    t.exec(
      "insert into runs (id, project_id, status, mode, form_hash, contract_version, formula_version, settings_version, started_by) values ('run-old', ?, 'running', 'real', 'h', '1', '1', '1', ?)",
      ids.projectId,
      ids.owner,
    );
    await expect(orch.executeRun("run-old")).rejects.toMatchObject({
      code: "BAD_INPUT",
    });
  });

  it("executeRun on an existing run continues the event sequence and saves once", async () => {
    const { orch, store } = orchestrator(ids.owner);
    await pinnedRun(store, "run-9");
    await store.appendRunEvent({
      run_id: "run-9",
      seq: 5,
      step: null,
      type: "status",
      payload_json: "{}",
      created_at: NOW,
    });
    const out = await orch.executeRun("run-9");
    expect(out.view.status).toBe("released");
    const events = await store.listRunEvents("run-9");
    expect(Math.min(...events.slice(1).map((e) => e.seq))).toBe(6);
  });

  it("refuses to run for a user who is no longer on the team", async () => {
    const { orch } = orchestrator(ids.outsider);
    await expect(orch.startRun()).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  });
});
