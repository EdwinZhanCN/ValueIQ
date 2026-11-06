import { beforeEach, describe, expect, it } from "vitest";
import { dryFetch } from "../../../assistant/dry-fetch";
import { resolveModels } from "../../../assistant/models";
import { RunOrchestrator } from "../../../assistant/run/orchestrator";
import { NOW, goldenResultForm } from "../../../engine/tests/forms";
import { D1RunStore } from "../run-store.server";
import { createTestD1, seedTeams, type TestD1 } from "./d1-shim";

let t: TestD1;
let ids: ReturnType<typeof seedTeams>;

beforeEach(() => {
  t = createTestD1();
  ids = seedTeams(t);
});

function orchestrator(userId: string) {
  const store = new D1RunStore(t.d1, { projectId: ids.projectId, userId });
  let n = 0;
  const orch = new RunOrchestrator({
    store,
    project_id: ids.projectId,
    user_id: userId,
    getForm: () => Promise.resolve(goldenResultForm()),
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
    const seqs = (await store.listRunEvents("run-1")).map((e) => e.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));

    const again = await orchestrator(ids.member).orch.startRun();
    expect(again.reused).toBe(true);
    expect(again.run_id).toBe("run-1");
  });

  it("executeRun on an existing run continues the event sequence and saves once", async () => {
    const { orch, store } = orchestrator(ids.owner);
    await store.createRun({
      id: "run-9",
      project_id: ids.projectId,
      mode: "real",
      form_hash: "h",
      contract_version: "1",
      formula_version: "1",
      settings_version: "1",
      started_by: ids.owner,
      started_at: NOW,
    });
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
