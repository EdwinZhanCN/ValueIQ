// Seeds a REAL assessment run on the deployed dev site and verifies it over HTTP and the agent
// WebSocket (no database access). See docs/seed-dev-real-run.md.
//
//   node scripts/seed-dev-real-run.mjs [--base https://valueiq-dev.zhanz.workers.dev]
//
// Creates a throwaway user, team and two projects, and calls the model for real (about 2 to 3 cents).
// It prints the throwaway password on purpose; it never prints cookies or keys.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { openAgentSocket } from "./agent-socket.mjs";

const argBase = process.argv.indexOf("--base");
const origin = (
  argBase > 0
    ? process.argv[argBase + 1]
    : "https://valueiq-dev.zhanz.workers.dev"
).replace(/\/+$/, "");
const SEED_DIR =
  process.env.SEED_FILES_DIR ??
  join(homedir(), "Dropbox", "Junior", "Fall", "SDND", "seed-files");
const RUN_TIMEOUT_MS = 6 * 60 * 1000;
const TERMINAL = new Set(["released", "gap_list", "failed", "cancelled"]);

const results = [];
const timings = {};
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
};
const log = (m) => console.log(`... ${m}`);
class StepError extends Error {}
const excerpt = (t) => String(t).replace(/\s+/g, " ").slice(0, 300);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(label, fn) {
  try {
    return await fn();
  } catch (e) {
    log(`${label} failed once (${e.message}); retrying`);
    await sleep(2000);
    return fn();
  }
}

const email = `seed-${Date.now()}@example.com`;
const password = randomBytes(18).toString("base64url") + "aA1!";
let cookie = "";

async function http(path, { method = "GET", body, form, json } = {}) {
  const headers = { origin };
  if (cookie) headers.cookie = cookie;
  let payload;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(json);
  } else if (body) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(body);
  } else if (form) payload = form;
  return fetch(origin + path, {
    method,
    headers,
    body: payload,
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
}
async function must(step, res, okStatuses) {
  if (okStatuses.includes(res.status)) return res;
  const text = await res.text().catch(() => "");
  throw new StepError(`${step}: HTTP ${res.status} ${excerpt(text)}`);
}

async function uploadFile(projectId, filePath, description) {
  const form = new FormData();
  form.set("file", new Blob([readFileSync(filePath)]), basename(filePath));
  form.set("description", description);
  const res = await must(
    `upload ${basename(filePath)}`,
    await http(`/projects/${projectId}/files`, { method: "POST", form }),
    [201],
  );
  return (await res.json()).file.id;
}

async function newProject(name) {
  const res = await must(
    `create project ${name}`,
    await http("/projects/new", {
      method: "POST",
      body: { name, goals: "Time savings" },
    }),
    [302, 303],
  );
  const id = res.headers.get("location")?.match(/^\/projects\/([\w-]+)$/)?.[1];
  if (!id)
    throw new StepError(`create project ${name}: no project id in redirect`);
  return id;
}

async function saveForm(projectId, form) {
  await must(
    "save form",
    await http(`/projects/${projectId}/form`, {
      method: "POST",
      body: { formJson: JSON.stringify(form) },
    }),
    [200],
  );
}

function openWatcher(ws) {
  let view = null;
  let last = "";
  ws.onState((s) => {
    view = s;
    const cl = (s.checklist ?? [])
      .map((c) => ({ done: "x", doing: ">", error: "!" })[c.state] ?? ".")
      .join("");
    const line = `${s.status} | ${s.step ?? "-"} | ${s.progress_pct}% | [${cl}]`;
    if (line !== last) console.log(`    state: ${line}`);
    last = line;
  });
  return {
    view: () => view,
    async waitTerminal(runId) {
      const t0 = Date.now();
      let tick = 0;
      while (Date.now() - t0 < RUN_TIMEOUT_MS) {
        if (view?.run_id === runId && TERMINAL.has(view.status)) return view;
        if (++tick % 15 === 0)
          console.log(
            `    ... ${Math.round((Date.now() - t0) / 1000)}s, status ${view?.status}`,
          );
        await sleep(1000);
      }
      return view;
    },
  };
}

async function openRunSocket(projectId, label) {
  const ws = await openAgentSocket(
    origin,
    `/agents/value-i-q-agent/${projectId}`,
    cookie,
    {},
  );
  check(`${label}: agent WebSocket opens`, ws.opened);
  if (!ws.opened) throw new StepError(`${label}: WebSocket did not open`);
  const first = await ws.state();
  check(
    `${label}: initial RunView is idle`,
    first.status === "idle",
    first.status,
  );
  return { ws, watch: openWatcher(ws) };
}

async function pageText(path) {
  const res = await must(`GET ${path}`, await http(path), [200]);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

const money = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
const pct = (v) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;

const urls = {};
try {
  log(`target ${origin}`);
  const home = await http("/");
  check(
    "dev site answers GET / with 200",
    home.status === 200,
    `HTTP ${home.status}`,
  );
  if (home.status !== 200) throw new StepError(`GET /: HTTP ${home.status}`);

  const sampleForm = readJson("docs/research/samples/sample-result.form.json");
  const sampleResult = readJson("docs/research/samples/sample-result.json");
  const gapForm = readJson("scripts/e2e-gap.form.json");

  // ---- account, team ----
  const signUp = await retry("sign-up", async () =>
    must(
      "sign-up",
      await http("/api/auth/sign-up/email", {
        method: "POST",
        json: { email, password, name: "Seed Demo" },
      }),
      [200],
    ),
  );
  cookie = signUp.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  check("sign-up returns a session", cookie.length > 0);
  const slug = `seed-${Date.now()}`;
  await must(
    "create team",
    await http("/api/auth/organization/create", {
      method: "POST",
      json: { name: `Seed demo team ${slug}`, slug },
    }),
    [200],
  );
  check("team created", true);

  // ---- project 1: sample result ----
  const pid = await newProject("Seed demo: sample result");
  log(`project ${pid}`);
  const uploads = [
    [
      "time",
      "pilot-time-study-q3-2025.xlsx",
      "Pilot time study, 120 weekly observations of hours saved",
    ],
    [
      "expedite",
      "expedite-invoices-2025.xlsx",
      "Expedited shipments by month 2025 and unit cost",
    ],
    [
      "incident",
      "incident-log-2025.docx",
      "Sustained outage incident log 2025",
    ],
    ["quote", "vendor-quote.docx", "Vendor quote for the platform"],
  ];
  const ids = {};
  const descriptions = {};
  for (const [key, file, desc] of uploads) {
    ids[key] = await retry(`upload ${file}`, () =>
      uploadFile(pid, join(SEED_DIR, file), desc),
    );
    descriptions[ids[key]] = desc;
  }
  check("four seed files uploaded", Object.keys(ids).length === 4);

  const fileFor = {
    hours_saved_per_staff_week: ids.time,
    error_count_before: ids.expedite,
    error_count_after: ids.expedite,
    cost_per_error: ids.expedite,
    aro_before: ids.incident,
    aro_after: ids.incident,
    loss_per_event: ids.incident,
    cost_one_time_vendor_license: ids.quote,
    cost_annual_run: ids.quote,
  };
  const form = structuredClone(sampleForm);
  for (const input of form.inputs)
    if (input.backing?.source_file_id) {
      const real = fileFor[input.id];
      if (!real) throw new StepError(`no real file mapped for ${input.id}`);
      input.backing.source_file_id = real;
    }
  form.file_descriptions = descriptions;
  await saveForm(pid, form);
  check("form saved through POST /projects/:id/form", true);

  const { ws, watch } = await openRunSocket(pid, "sample");
  log("preflight (assistant model)");
  const pre = await ws.rpc("preflight", [], 180000);
  check(
    "preflight ok",
    pre.ok === true,
    pre.ok ? `passed=${pre.value.passed}` : JSON.stringify(pre.error),
  );
  log("startRun");
  const t0 = Date.now();
  const start = await ws.rpc("startRun", [], 60000);
  check(
    "startRun ok",
    start.ok === true,
    start.ok ? "" : JSON.stringify(start.error),
  );
  if (!start.ok)
    throw new StepError(`startRun: ${excerpt(JSON.stringify(start.error))}`);
  const runId = start.value.run_id;
  const done = await watch.waitTerminal(runId);
  timings.sample = Math.round((Date.now() - t0) / 1000);
  check(
    "sample run ends released",
    done?.status === "released",
    `${done?.status}${done?.error ? " " + done.error.code : ""}, ${timings.sample}s`,
  );
  if (done?.status !== "released")
    throw new StepError(`sample run ended ${done?.status}`);

  urls.project = `${origin}/projects/${pid}`;
  urls.process = `${origin}/projects/${pid}/process`;
  urls.results = `${origin}/projects/${pid}/results?run=${runId}`;
  urls.report = `${origin}/projects/${pid}/report?run=${runId}`;

  // ---- stored result via the app's own results page ----
  const text = await pageText(`/projects/${pid}/results?run=${runId}`);
  const h = sampleResult.result.headline;
  check(
    "results page renders a result (not 'No result yet')",
    !/No result yet|still working/.test(text),
  );
  for (const [n, s] of [
    ["NPV capacity-inclusive", money(h.npv.capacity_inclusive)],
    ["NPV hard", money(h.npv.hard)],
    ["ROI capacity-inclusive", pct(h.roi.undiscounted.capacity_inclusive)],
    ["ROI on PV capacity-inclusive", pct(h.roi.pv.capacity_inclusive)],
  ])
    check(`results page shows ${n} ${s}`, text.includes(s));

  // ---- idempotent repeat ----
  const again = await ws.rpc("startRun", [], 60000);
  await sleep(4000);
  const v = watch.view();
  check(
    "second startRun returns the same run id",
    again.ok && again.value.run_id === runId,
  );
  check(
    "no new run visible after repeat (state stays released; model calls are not observable here)",
    v?.run_id === runId && v?.status === "released",
    String(v?.status),
  );
  ws.close();

  // ---- project 2: gap list ----
  const gid = await newProject("Seed demo: gap list");
  const gdesc = "Expedited shipments by month 2025 and unit cost";
  const gfile = await retry("upload gap file", () =>
    uploadFile(gid, join(SEED_DIR, "expedite-invoices-2025.xlsx"), gdesc),
  );
  const gform = structuredClone(gapForm);
  gform.file_descriptions = { [gfile]: gdesc };
  await saveForm(gid, gform);
  const g = await openRunSocket(gid, "gap");
  const gt0 = Date.now();
  const gs = await g.ws.rpc("startRun", [], 60000);
  check(
    "gap startRun ok",
    gs.ok === true,
    gs.ok ? "" : JSON.stringify(gs.error),
  );
  if (!gs.ok)
    throw new StepError(`gap startRun: ${excerpt(JSON.stringify(gs.error))}`);
  const gdone = await g.watch.waitTerminal(gs.value.run_id);
  timings.gap = Math.round((Date.now() - gt0) / 1000);
  check(
    "gap run ends gap_list",
    gdone?.status === "gap_list",
    `${gdone?.status}, ${timings.gap}s`,
  );
  urls.gapProject = `${origin}/projects/${gid}`;
  urls.gapResults = `${origin}/projects/${gid}/results?run=${gs.value.run_id}`;
  const gtext = await pageText(
    `/projects/${gid}/results?run=${gs.value.run_id}`,
  );
  check(
    "gap page shows the not-enough-evidence content",
    /Build the evidence, then the estimate/.test(gtext) &&
      /Release floor/.test(gtext),
  );
  check("gap page has no headline numbers", !/Headline results/.test(gtext));
  g.ws.close();
} catch (error) {
  check(
    "script completed",
    false,
    error instanceof Error ? error.message : String(error),
  );
}

const failed = results.filter((r) => !r.pass);
console.log("\n==== SUMMARY ====");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
console.log(
  `Run time: sample ${timings.sample ?? "n/a"}s, gap ${timings.gap ?? "n/a"}s`,
);
for (const [k, u] of Object.entries(urls)) console.log(`URL ${k}: ${u}`);
console.log(`Sign in at ${origin}/sign-in`);
console.log(`Throwaway email: ${email}`);
console.log(`Throwaway password: ${password}`);
process.exit(failed.length ? 1 : 0);
