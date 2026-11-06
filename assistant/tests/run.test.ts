import { describe, expect, it } from "vitest";
import type { RunOutput } from "../../engine";
import { NOW, goldenGapForm, goldenResultForm } from "../../engine/tests/forms";
import { dryFetch } from "../dry-fetch";
import type { FetchLike } from "../gemini";
import { resolveModels } from "../models";
import { MemoryRunStore } from "../run/memory-store";
import {
  OrchestratorError,
  RunOrchestrator,
  type OrchestratorDeps,
} from "../run/orchestrator";
import type { RunView } from "../run/types";
import { call, fakeFetch, say } from "./fake";

function setup(
  over: Partial<OrchestratorDeps> = {},
  form = goldenResultForm(),
) {
  const store = new MemoryRunStore();
  const views: RunView[] = [];
  let n = 0;
  let fetchCalls = 0;
  const inner = over.fetch ?? dryFetch();
  const counted: FetchLike = (url, init) => {
    fetchCalls += 1;
    return inner(url, init);
  };
  const orch = new RunOrchestrator({
    store,
    project_id: "p1",
    user_id: "u1",
    getForm: () => Promise.resolve(form),
    apiKey: "test-key",
    models: resolveModels({}),
    now: () => NOW,
    newRunId: () => `run-${++n}`,
    onView: (v) => views.push(v),
    ...over,
    fetch: counted,
  });
  return { orch, store, views, calls: () => fetchCalls };
}

describe("K16 run orchestrator: full runs", () => {
  it("runs to released, stores result_json only, and writes contiguous ids-and-hashes events", async () => {
    const { orch, store, views } = setup();
    const out = await orch.startRun();
    expect(out.view.status).toBe("released");
    expect(out.view.progress_pct).toBe(100);
    expect(out.view.checklist.every((c) => c.state === "done")).toBe(true);
    expect(out.output?.kind).toBe("result");
    expect(out.narrative?.source).toBe("model");
    expect(out.view.pending_question).toBeNull();
    const rec = await store.getRun("run-1");
    expect(rec).toMatchObject({
      status: "released",
      started_by: "u1",
      project_id: "p1",
    });
    expect(rec?.finished_at).toBe(NOW);
    const row = await store.getResult("run-1");
    expect(row?.result_json).not.toBeNull();
    expect(row?.gap_list_json).toBeNull();
    expect((JSON.parse(row?.result_json ?? "{}") as RunOutput).kind).toBe(
      "result",
    );
    const ev = await store.listRunEvents("run-1");
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i + 1));
    const dump = JSON.stringify(ev);
    expect(dump).not.toContain("test-key");
    expect(
      ev.some(
        (e) => e.type === "tool_call" && dump.includes("compute_project"),
      ),
    ).toBe(true);
    // views: running first, released last, never blocked_on_question
    expect(views[0]?.status).toBe("running");
    expect(views.at(-1)?.status).toBe("released");
    expect(views.some((v) => v.status === "blocked_on_question")).toBe(false);
    expect(views.map((v) => v.progress_pct)).toEqual(
      [...views.map((v) => v.progress_pct)].sort((a, b) => a - b),
    );
  });

  it("runs to gap_list, stores gap_list_json only and no headline", async () => {
    const { orch, store } = setup({}, goldenGapForm());
    const out = await orch.startRun();
    expect(out.view.status).toBe("gap_list");
    expect(out.output?.kind).toBe("gap_list");
    expect(out.output?.result).toBeUndefined();
    const row = await store.getResult("run-1");
    expect(row?.gap_list_json).not.toBeNull();
    expect(row?.result_json).toBeNull();
    expect((await store.getRun("run-1"))?.status).toBe("gap_list");
  });

  it("preflight returns the engine's gate result plus the assistant's words and goes back to idle", async () => {
    const { orch, views } = setup();
    const r = await orch.preflight();
    expect(r.passed).toBe(true);
    expect(r.cancelled).toBe(false);
    expect(r.message.length).toBeGreaterThan(0);
    expect(views[0]?.status).toBe("preflight");
    expect(orch.view.status).toBe("idle");
  });
});

describe("K16 run orchestrator: questions are tabled", () => {
  it("answerQuestion returns a typed NOT_SUPPORTED error and no run ever blocks on a question", async () => {
    const { orch, views } = setup();
    await orch.startRun();
    const r = await orch.answerQuestion("q-1", { option: "exclude" });
    expect(r).toEqual({
      ok: false,
      error: {
        code: "NOT_SUPPORTED",
        message: expect.any(String) as string,
        retryable: false,
      },
    });
    expect(views.every((v) => v.pending_question === null)).toBe(true);
  });
});

describe("K16 run orchestrator: cancel", () => {
  it("cancel during preflight", async () => {
    const h: { orch?: RunOrchestrator } = {};
    let n = 0;
    const fetch = fakeFetch([
      () => {
        n += 1;
        if (n === 1) void h.orch?.cancelRun();
        return { parts: [call("validate_inputs")] };
      },
      () => ({ parts: [say("ok")] }),
    ]);
    const s = setup({ fetch });
    h.orch = s.orch;
    const r = await s.orch.preflight();
    expect(r.cancelled).toBe(true);
    expect(s.orch.view.status).toBe("cancelled");
  });

  it("cancel while running ends cancelled, stops calling the model and saves no result", async () => {
    const h: { orch?: RunOrchestrator } = {};
    const base = dryFetch();
    let calls = 0;
    const fetch: FetchLike = (url, init) => {
      calls += 1;
      if (calls === 3) void h.orch?.cancelRun();
      return base(url, init);
    };
    const s = setup({ fetch });
    h.orch = s.orch;
    const out = await s.orch.startRun();
    expect(out.view.status).toBe("cancelled");
    expect((await s.store.getRun("run-1"))?.status).toBe("cancelled");
    expect(await s.store.getResult("run-1")).toBeNull();
    expect(out.output).toBeNull();
    expect(calls).toBeLessThanOrEqual(4);
  });

  it("cancel after the run finished or when idle changes nothing", async () => {
    const { orch, store } = setup();
    expect((await orch.cancelRun()).status).toBe("idle");
    await orch.startRun();
    expect((await orch.cancelRun()).status).toBe("released");
    expect((await store.getRun("run-1"))?.status).toBe("released");
  });
});

describe("K16 run orchestrator: failures, idempotency and access", () => {
  it("a model failure ends failed with retryable true, and a retry makes a new run", async () => {
    let healthy = false;
    const bad = fakeFetch([() => ({ parts: [say("x")], status: 500 })]);
    const good = dryFetch();
    const fetch: FetchLike = (u, i) => (healthy ? good(u, i) : bad(u, i));
    const { orch, store } = setup({ fetch });
    const out = await orch.startRun();
    expect(out.view.status).toBe("failed");
    expect(out.view.error).toMatchObject({
      code: "MODEL_ERROR",
      retryable: true,
    });
    const rec = await store.getRun("run-1");
    expect(rec?.status).toBe("failed");
    expect(rec?.error?.retryable).toBe(true);
    expect(await store.getResult("run-1")).toBeNull();
    healthy = true;
    const again = await orch.startRun();
    expect(again.run_id).toBe("run-2");
    expect(again.view.status).toBe("released");
  });

  it("a model mismatch fails the run as not retryable", async () => {
    const fetch = fakeFetch([
      () => ({ parts: [say("hi")], modelVersion: "gemini-2.0-flash" }),
    ]);
    const { orch } = setup({ fetch });
    const out = await orch.startRun();
    expect(out.view.status).toBe("failed");
    expect(out.view.error).toMatchObject({
      code: "MODEL_ERROR",
      retryable: false,
    });
  });

  it("startRun is idempotent for the same form hash and makes no extra model calls", async () => {
    const { orch, store, calls } = setup();
    const a = await orch.startRun();
    const callsAfterFirst = calls();
    const b = await orch.startRun();
    expect(b.reused).toBe(true);
    expect(b.run_id).toBe(a.run_id);
    expect(b.view.status).toBe("released");
    expect(b.output?.kind).toBe("result");
    expect(calls()).toBe(callsAfterFirst);
    expect(store.runs.size).toBe(1);
  });

  it("an edited form starts a new run and the old run is kept", async () => {
    const form = goldenResultForm();
    let current = form;
    const s = setup({ getForm: () => Promise.resolve(current) });
    await s.orch.startRun();
    current = {
      ...form,
      inputs: form.inputs.map((i) =>
        i.id === "staff_affected" ? { ...i, value: 11 } : i,
      ),
    };
    const second = await s.orch.startRun();
    expect(second.reused).toBe(false);
    expect(s.store.runs.size).toBe(2);
    // input order does not change the hash
    const shuffled = { ...current, inputs: [...current.inputs].reverse() };
    current = shuffled;
    expect((await s.orch.startRun()).reused).toBe(true);
  });

  it("a user who lost access gets ACCESS_DENIED from every method", async () => {
    const { orch, store } = setup({
      checkAccess: () => Promise.resolve(false),
    });
    await expect(orch.startRun()).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(orch.cancelRun()).rejects.toBeInstanceOf(OrchestratorError);
    await expect(orch.preflight()).rejects.toBeInstanceOf(OrchestratorError);
    expect(store.runs.size).toBe(0);
  });
});

describe("K16 memory run store enforces the table constraints", () => {
  it("exactly one of result_json and gap_list_json, and unique (run_id, seq)", async () => {
    const s = new MemoryRunStore();
    await s.createRun({
      id: "r",
      project_id: "p",
      mode: "real",
      form_hash: "h",
      contract_version: "1",
      formula_version: "0.1",
      settings_version: "s1",
      started_by: "u",
      started_at: NOW,
      form: goldenResultForm(),
    });
    await s.appendRunEvent({
      run_id: "r",
      seq: 1,
      step: null,
      type: "t",
      payload_json: "{}",
      created_at: NOW,
    });
    await expect(
      s.appendRunEvent({
        run_id: "r",
        seq: 1,
        step: null,
        type: "t",
        payload_json: "{}",
        created_at: NOW,
      }),
    ).rejects.toThrow(/duplicate/);
    const bad = { kind: "result", meta: {} } as unknown as RunOutput;
    const row = await s.saveResult("r", bad, NOW);
    expect(
      [row.result_json, row.gap_list_json].filter((x) => x !== null),
    ).toHaveLength(1);
    await expect(s.saveResult("r", bad, NOW)).rejects.toThrow(/already saved/);
  });
});
