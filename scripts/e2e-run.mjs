// End-to-end real run against the local Worker: sign up, create a project, save a form through the
// real save path, open the agent WebSocket, preflight (assistant model), startRun (calc model inside
// the CalculationRun workflow), then check what was stored in local D1.
//
//   pnpm test:e2e
//
// Needs GEMINI_API_KEY in .dev.vars (the script only tests that the name is present; it never reads,
// prints or logs the value). Without it the live parts are skipped and the script exits 0.
// Models are called for real: expect a few cents of cost and a few minutes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openAgentSocket } from "./agent-socket.mjs";
import { localSql, startDevServer, stopDevServer } from "./dev-server.mjs";

const port = Number(process.env.VALUEIQ_SMOKE_PORT ?? 5179);
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const TERMINAL = new Set(["released", "gap_list", "failed", "cancelled"]);
// USD per 1M tokens (assistant, calc); matches assistant/live-run.ts. An estimate, not a bill.
const PRICE = { assistant: [0.3, 2.5], calc: [0.75, 3.75] };

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
}
const log = (m) => console.log(`... ${m}`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const hasKey = /^GEMINI_API_KEY=\S/m.test(readFileSync(".dev.vars", "utf8"));
if (!hasKey) {
  console.log(
    "SKIP  GEMINI_API_KEY is not in .dev.vars: the live run was not attempted. Append it and rerun.",
  );
  process.exit(0);
}

const sampleForm = readJson("docs/research/samples/sample-result.form.json");
const sampleResult = readJson("docs/research/samples/sample-result.json");
const gapForm = readJson("scripts/e2e-gap.form.json");

const close = (a, e) => {
  if (e === null || e === undefined) return a === null || a === undefined;
  if (typeof a !== "number") return false;
  const tol = Math.abs(e) < 1.5 ? 5.1e-5 : Math.max(1e-6 * Math.abs(e), 5.1e-3);
  return Math.abs(a - e) <= tol;
};

async function query(sql) {
  const out = await localSql(sql);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

let server;
try {
  log("starting the local Worker");
  server = await startDevServer(port);
  const { origin } = server;

  async function post(path, cookie, body, json = true) {
    return fetch(origin + path, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin,
        cookie,
        "content-type": json
          ? "application/json"
          : "application/x-www-form-urlencoded",
      },
      body: json ? JSON.stringify(body) : new URLSearchParams(body),
      signal: AbortSignal.timeout(20000),
    });
  }

  const tag = `e2e-${Date.now()}`;
  const signUp = await post("/api/auth/sign-up/email", "", {
    email: `${tag}@example.test`,
    password: "e2e-password-1",
    name: "E2E",
  });
  assert.equal(signUp.status, 200, "sign-up");
  const cookie = signUp.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const org = await post("/api/auth/organization/create", cookie, {
    name: `${tag} team`,
    slug: `${tag}-team`,
  });
  assert.equal(org.status, 200, "create team");
  const created = await post(
    "/projects/new",
    cookie,
    { name: `${tag} project`, goals: "Time savings" },
    false,
  );
  const projectId = created.headers
    .get("location")
    ?.match(/^\/projects\/([\w-]+)$/)?.[1];
  assert(projectId, "create project");
  log(`project ${projectId}`);

  // The fixtures cite file "f1"; upload a real file and point them at it.
  const upload = new FormData();
  upload.set("file", new Blob(["e2e evidence"]), "e2e.txt");
  upload.set("description", "test file");
  const uploaded = await fetch(`${origin}/projects/${projectId}/files`, {
    method: "POST",
    headers: { origin, cookie },
    body: upload,
  });
  assert.equal(uploaded.status, 201, "upload evidence file");
  const fileId = (await uploaded.json()).file.id;

  const saveForm = async (form) => {
    const r = await post(
      `/projects/${projectId}`,
      cookie,
      {
        formJson: JSON.stringify(form).replaceAll(
          '"f1"',
          JSON.stringify(fileId),
        ),
      },
      false,
    );
    assert.equal(r.status, 200, "save form");
  };

  const ws = await openAgentSocket(
    origin,
    `/agents/value-i-q-agent/${projectId}`,
    cookie,
    {},
  );
  check("agent WebSocket opens for the new member", ws.opened);
  if (!ws.opened) throw new Error("no socket");
  let view = await ws.state();
  check("initial RunView is idle", view.status === "idle");

  // Print every status or checklist change.
  let lastLine = "";
  ws.onState((s) => {
    view = s;
    const cl = (s.checklist ?? [])
      .map((c) =>
        c.state === "done"
          ? "x"
          : c.state === "doing"
            ? ">"
            : c.state === "error"
              ? "!"
              : ".",
      )
      .join("");
    const line = `${s.status} | ${s.step ?? "-"} | ${s.progress_pct}% | [${cl}]`;
    if (line !== lastLine) console.log(`    state: ${line}`);
    lastLine = line;
  });

  async function waitTerminal(runId, label) {
    const t0 = Date.now();
    while (Date.now() - t0 < RUN_TIMEOUT_MS) {
      if (view.run_id === runId && TERMINAL.has(view.status)) return view;
      await new Promise((r) => setTimeout(r, 1000));
    }
    check(`${label}: finished within 5 minutes`, false);
    return view;
  }

  // ---- preflight (assistant model) ----
  await saveForm(sampleForm);
  log("preflight (assistant model)");
  const pre = await ws.rpc("preflight", [], 180000);
  check(
    "preflight returns ok",
    pre.ok === true,
    pre.ok ? `passed=${pre.value.passed}` : JSON.stringify(pre.error),
  );
  if (pre.ok)
    check(
      "preflight was not cancelled and carries a message",
      !pre.value.cancelled && pre.value.message.length > 0,
    );

  // ---- run 1: sample result form ----
  log("startRun (calc model, CalculationRun workflow)");
  const start = await ws.rpc("startRun", [], 60000);
  check(
    "startRun returns ok",
    start.ok === true,
    start.ok ? "" : JSON.stringify(start.error),
  );
  const runId = start.value.run_id;
  const done = await waitTerminal(runId, "sample run");
  check(
    "sample run ends released",
    done.status === "released",
    done.status + (done.error ? ` ${done.error.code}` : ""),
  );

  const run1 = (await query(`SELECT * FROM runs WHERE id = '${runId}'`))[0];
  check("runs.mode is real", run1?.mode === "real");
  check(
    "versions recorded",
    Boolean(
      run1?.contract_version && run1?.formula_version && run1?.settings_version,
    ),
    `${run1?.contract_version}/${run1?.formula_version}/${run1?.settings_version}`,
  );
  check("finished_at set", Boolean(run1?.finished_at));
  const res1 = (
    await query(
      `SELECT result_json, gap_list_json FROM run_results WHERE run_id = '${runId}'`,
    )
  )[0];
  check(
    "run_results: result_json xor gap_list_json",
    Boolean(res1) &&
      (res1.result_json === null) !== (res1.gap_list_json === null),
  );
  const out1 = res1?.result_json ? JSON.parse(res1.result_json) : null;
  check(
    "output kind is result with mode real",
    out1?.kind === "result" && out1?.meta?.mode === "real",
  );
  const h = out1?.result?.headline;
  const e = sampleResult.result.headline;
  const pairs = [
    ["npv.hard", h?.npv?.hard, e.npv.hard],
    [
      "npv.capacity_inclusive",
      h?.npv?.capacity_inclusive,
      e.npv.capacity_inclusive,
    ],
    [
      "roi.undiscounted.hard",
      h?.roi?.undiscounted?.hard,
      e.roi.undiscounted.hard,
    ],
    [
      "roi.undiscounted.capacity_inclusive",
      h?.roi?.undiscounted?.capacity_inclusive,
      e.roi.undiscounted.capacity_inclusive,
    ],
    ["roi.pv.hard", h?.roi?.pv?.hard, e.roi.pv.hard],
    [
      "roi.pv.capacity_inclusive",
      h?.roi?.pv?.capacity_inclusive,
      e.roi.pv.capacity_inclusive,
    ],
    ["payback.hard.years", h?.payback?.hard?.years, e.payback.hard.years],
    [
      "payback.capacity_inclusive.years",
      h?.payback?.capacity_inclusive?.years,
      e.payback.capacity_inclusive.years,
    ],
    ["benefits_pv", h?.benefits_pv, e.benefits_pv],
    ["costs_pv", h?.costs_pv, e.costs_pv],
  ];
  for (const [n, a, x] of pairs)
    check(
      `headline ${n} equals sample-result.json`,
      close(a, x),
      `actual=${a} expected=${x}`,
    );

  // ---- events ----
  const events = await query(
    `SELECT seq, step, type, payload_json FROM run_events WHERE run_id = '${runId}' ORDER BY seq`,
  );
  check("run_events exist", events.length > 0, `${events.length} events`);
  check(
    "run_events seq increases from 1 with no gaps",
    events.every((ev, i) => ev.seq === i + 1),
  );
  const payloads = events.map((ev) => JSON.parse(ev.payload_json));
  const blob = events.map((ev) => ev.payload_json).join("\n");
  check(
    "no key-like strings in events",
    !/AIza[0-9A-Za-z_-]{10,}/.test(blob) &&
      !/\bsk-[A-Za-z0-9]{16,}/.test(blob) &&
      !/api[_-]?key/i.test(blob),
  );
  const longStrings = payloads
    .flatMap((p) => Object.values(p))
    .filter((v) => typeof v === "string" && v.length > 200);
  check(
    "no long text (prompts, narratives, file contents) in events",
    longStrings.length === 0,
  );
  const modelIds = [...new Set(payloads.map((p) => p.model).filter(Boolean))];
  check(
    "events name only gemini model ids",
    modelIds.length > 0 && modelIds.every((m) => /^gemini-/.test(m)),
    modelIds.join(", "),
  );
  const tokens = payloads.reduce(
    (a, p) => ({
      i: a.i + (p.prompt_tokens ?? 0),
      o: a.o + (p.output_tokens ?? 0) + (p.thought_tokens ?? 0),
    }),
    { i: 0, o: 0 },
  );
  const [pi, po] = PRICE.calc;
  console.log(
    `      tokens (run events): input ${tokens.i}, output+thinking ${tokens.o}; cost estimate $${((tokens.i * pi + tokens.o * po) / 1e6).toFixed(4)} (calc prices; preflight is not logged)`,
  );
  const src =
    payloads.find((p) => p.narrative_source)?.narrative_source ??
    payloads.find((p) => p.source)?.source;
  console.log(`      narrative source: ${src ?? "unknown"}`);

  // ---- idempotent repeat ----
  const before = (
    await query(
      `SELECT count(*) AS n FROM run_events WHERE run_id = '${runId}'`,
    )
  )[0].n;
  const again = await ws.rpc("startRun", [], 60000);
  check(
    "repeat startRun returns the same run id",
    again.ok && again.value.run_id === runId,
  );
  await new Promise((r) => setTimeout(r, 4000));
  const after = (
    await query(
      `SELECT count(*) AS n FROM run_events WHERE run_id = '${runId}'`,
    )
  )[0].n;
  const runCount = (
    await query(
      `SELECT count(*) AS n FROM runs WHERE project_id = '${projectId}'`,
    )
  )[0].n;
  check(
    "repeat startRun adds no events and no run (no new model call)",
    before === after && runCount === 1,
    `events ${before}->${after}, runs ${runCount}`,
  );

  // ---- run 2: gap list form ----
  await saveForm(gapForm);
  log("startRun with the gap-list form");
  const gstart = await ws.rpc("startRun", [], 60000);
  check(
    "gap startRun returns ok",
    gstart.ok === true,
    gstart.ok ? "" : JSON.stringify(gstart.error),
  );
  const gid = gstart.value.run_id;
  check("gap form makes a new run", gid !== runId);
  const gdone = await waitTerminal(gid, "gap run");
  check(
    "gap run ends gap_list",
    gdone.status === "gap_list",
    gdone.status + (gdone.error ? ` ${gdone.error.code}` : ""),
  );
  const gres = (
    await query(
      `SELECT result_json, gap_list_json FROM run_results WHERE run_id = '${gid}'`,
    )
  )[0];
  check(
    "gap run_results: gap_list_json only",
    Boolean(gres) && gres.result_json === null && gres.gap_list_json !== null,
  );
  const gout = gres?.gap_list_json ? JSON.parse(gres.gap_list_json) : null;
  check(
    "gap output has no headline",
    gout?.kind === "gap_list" && !gout?.result,
  );
  check(
    "gap project_confidence is 0.615",
    close(gout?.gap_list?.project_confidence, 0.615),
    String(gout?.gap_list?.project_confidence),
  );

  // ---- cancel a fresh run ----
  await saveForm({ ...sampleForm, horizon_years: 4 });
  const cstart = await ws.rpc("startRun", [], 60000);
  check(
    "cancel candidate starts",
    cstart.ok === true &&
      cstart.value.run_id !== runId &&
      cstart.value.run_id !== gid,
  );
  const cid = cstart.value.run_id;
  const cancel = await ws.rpc("cancelRun", [], 30000);
  check(
    "cancelRun returns ok with a cancelled view",
    cancel.ok === true && cancel.value.status === "cancelled",
    cancel.ok ? cancel.value.status : JSON.stringify(cancel.error),
  );
  await new Promise((r) => setTimeout(r, 8000));
  const crow = (await query(`SELECT status FROM runs WHERE id = '${cid}'`))[0];
  const cres = await query(
    `SELECT run_id FROM run_results WHERE run_id = '${cid}'`,
  );
  check(
    "cancelled run row stays cancelled with no result",
    crow?.status === "cancelled" && cres.length === 0,
    crow?.status,
  );
  ws.close();
} catch (error) {
  check(
    "script completed without an unexpected error",
    false,
    error instanceof Error ? error.message : String(error),
  );
  if (server) console.error(server.logs.slice(-3000));
} finally {
  await stopDevServer(server);
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length ? 1 : 0);
