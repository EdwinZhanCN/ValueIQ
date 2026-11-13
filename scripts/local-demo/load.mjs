// Loads the SYNTHETIC Northline case into a running LOCAL Worker, through the
// same pages and endpoints a person uses (never by writing D1 directly):
//
//   pnpm dev                                    # in another terminal
//   node scripts/local-demo/load.mjs            # default http://localhost:5173
//   VALUEIQ_DEMO_ORIGIN=http://127.0.0.1:5179 node scripts/local-demo/load.mjs
//
// It refuses any origin that is not localhost or 127.0.0.1. Each load makes a
// fresh set of accounts (owner, member, outsider) and a fresh team, then six
// projects A-F in different states, and writes the logins to
// .wrangler/local-demo/accounts.json. Runs need a model: with
// VALUEIQ_MODEL=dry in .dev.vars they use the scripted model and are STUB.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { openAgentSocket } from "../agent-socket.mjs";
import { localSql } from "../dev-server.mjs";
import { CASE, EXPECTED, FILES, SUPPORTING } from "./case.ts";
import { OUT_DIR, writeDemoFiles } from "./make-files.ts";

const origin = process.env.VALUEIQ_DEMO_ORIGIN ?? "http://localhost:5173";
const url = new URL(origin);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error(`Refusing to load demo data into ${origin}: local only.`);
  process.exit(2);
}

const PASSWORD = "synthetic-demo-1";
const TERMINAL = new Set(["released", "gap_list", "failed", "cancelled"]);
const tag = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(4, 14)
  .toLowerCase();
const log = (m) => console.log(`... ${m}`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const sampleForm = readJson("docs/research/samples/sample-result.form.json");
const gapForm = readJson("scripts/e2e-gap.form.json");

async function post(path, cookie, body, kind = "form") {
  const headers = { origin, cookie };
  let payload = body;
  if (kind === "json") {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  } else if (kind === "form") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(body);
  }
  return fetch(origin + path, {
    method: "POST",
    redirect: "manual",
    headers,
    body: payload,
    signal: AbortSignal.timeout(60000),
  });
}

const cookiesOf = (response, previous = "") => {
  const jar = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((c) => [c.split("=")[0], c]),
  );
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    jar.set(pair.split("=")[0], pair);
  }
  return [...jar.values()].join("; ");
};

async function signUp(role) {
  const email = `${role}-${tag}@northline.example`;
  const r = await post(
    "/api/auth/sign-up/email",
    "",
    {
      email,
      password: PASSWORD,
      name: `${role[0].toUpperCase()}${role.slice(1)} (synthetic)`,
    },
    "json",
  );
  assert.equal(r.status, 200, `sign up ${role}: ${r.status}`);
  return { email, password: PASSWORD, cookie: cookiesOf(r) };
}

async function createTeam(account, name) {
  const r = await post("/teams/new", account.cookie, { name });
  assert.equal(r.status, 302, `create team ${name}: ${r.status}`);
  account.cookie = cookiesOf(r, account.cookie);
}

async function addMember(owner, email) {
  const r = await post("/team", owner.cookie, { intent: "add-member", email });
  assert.equal(r.status, 200, `add member: ${r.status}`);
}

async function createProject(owner, name, goals) {
  const r = await post("/projects/new", owner.cookie, {
    name: `${name} (synthetic)`,
    goals: goals.join("\n"),
  });
  const id = r.headers.get("location")?.match(/^\/projects\/([\w-]+)$/)?.[1];
  assert(id, `create project ${name}: ${r.status}`);
  return id;
}

async function upload(owner, projectId, key) {
  const meta = FILES[key];
  const path = join(OUT_DIR, meta.name);
  const body = new FormData();
  body.set(
    "file",
    new Blob([readFileSync(path)], { type: meta.mime }),
    meta.name,
  );
  body.set("description", meta.description);
  const r = await post(
    `/projects/${projectId}/files`,
    owner.cookie,
    body,
    "raw",
  );
  assert.equal(r.status, 201, `upload ${meta.name}: ${r.status}`);
  return (await r.json()).file.id;
}

async function saveForm(owner, projectId, form) {
  const r = await post(`/projects/${projectId}/form`, owner.cookie, {
    formJson: JSON.stringify(form),
  });
  assert.equal(r.status, 200, `save form: ${r.status}`);
}

/** The sample form with its file references pointed at this project's uploads. */
function citedForm(base, ids, extra = {}) {
  const fileFor = (inputId) =>
    Object.keys(ids).find((key) => FILES[key].cites.includes(inputId));
  const inputs = base.inputs.map((input) => {
    if (!input.backing?.source_file_id) return input;
    const key = fileFor(input.id) ?? "timesheet";
    return {
      ...input,
      backing: { ...input.backing, source_file_id: ids[key] },
    };
  });
  const file_descriptions = Object.fromEntries(
    Object.entries(ids).map(([key, id]) => [id, FILES[key].description]),
  );
  return {
    ...base,
    inputs: [
      {
        id: "project_name",
        value: CASE.project,
        tier: "documented",
        origin: "user",
      },
      {
        id: "decision_statement",
        value: CASE.decision,
        tier: "documented",
        origin: "user",
      },
      ...inputs,
    ],
    file_descriptions,
    ...extra,
  };
}

async function supporting(owner, projectId) {
  const ids = {};
  for (const key of SUPPORTING) ids[key] = await upload(owner, projectId, key);
  return ids;
}

async function run(owner, projectId) {
  const ws = await openAgentSocket(
    origin,
    `/agents/value-i-q-agent/${projectId}`,
    owner.cookie,
    {},
  );
  assert(ws.opened, "agent socket");
  let view = await ws.state();
  ws.onState((s) => (view = s));
  const start = await ws.rpc("startRun", [], 60000);
  assert(start.ok, `startRun: ${JSON.stringify(start.error)}`);
  const runId = start.value.run_id;
  const t0 = Date.now();
  while (!(view.run_id === runId && TERMINAL.has(view.status))) {
    if (Date.now() - t0 > 5 * 60 * 1000) throw new Error("run timed out");
    await new Promise((r) => setTimeout(r, 500));
  }
  ws.close();
  return { runId, view };
}

async function fetchJson(path, cookie) {
  const r = await fetch(origin + path, { headers: { cookie } });
  return { status: r.status, text: await r.text() };
}

writeDemoFiles();
log(`loading into ${origin} (tag ${tag})`);
const owner = await signUp("owner");
const member = await signUp("member");
const outsider = await signUp("outsider");
await createTeam(owner, `${CASE.company} (synthetic) ${tag}`);
await addMember(owner, member.email);
await createTeam(outsider, `Other Co (synthetic) ${tag}`);

const projects = {};

// A: just created, nothing filled in.
projects.A = await createProject(owner, "A · Blank", []);
log("A: created");

// B: goals chosen, Clarify not finished.
projects.B = await createProject(owner, "B · Goals only", ["Time savings"]);
await saveForm(owner, projects.B, {
  version: 1,
  goals: ["time_savings"],
  currency: "USD",
  horizon_years: 3,
  inputs: [
    {
      id: "project_name",
      value: CASE.project,
      tier: "documented",
      origin: "user",
    },
    {
      id: "decision_statement",
      value: CASE.decision,
      tier: "documented",
      origin: "user",
    },
  ],
  file_descriptions: {},
  other_notes: "",
  measurement_plan: {},
  asked: [],
});
log("B: goals saved");

// C: complete form, never run.
projects.C = await createProject(owner, "C · Ready to run", [
  "Time savings",
  "Data quality",
  "Risk reduction",
]);
await saveForm(
  owner,
  projects.C,
  citedForm(sampleForm, await supporting(owner, projects.C)),
);
log("C: complete form saved");

// D: run ended with a gap list; one input marked Not sure.
projects.D = await createProject(owner, "D · Gap list", ["Time savings"]);
{
  const ids = { timesheet: await upload(owner, projects.D, "timesheet") };
  const form = citedForm(gapForm, ids);
  form.inputs = form.inputs.map((input) =>
    input.id === "weeks_per_year"
      ? { id: input.id, value: null, tier: "user_unknown", origin: "user" }
      : input,
  );
  await saveForm(owner, projects.D, form);
  const { view } = await run(owner, projects.D);
  assert.equal(view.status, "gap_list", `D ends gap_list, got ${view.status}`);
}
log("D: gap list run done");

// E: released result, no report.  F: released result with a report.
const runs = {};
for (const key of ["E", "F"]) {
  projects[key] = await createProject(
    owner,
    key === "E" ? "E · Result" : "F · Reported",
    ["Time savings", "Data quality", "Risk reduction"],
  );
  await saveForm(
    owner,
    projects[key],
    citedForm(sampleForm, await supporting(owner, projects[key])),
  );
  const { runId, view } = await run(owner, projects[key]);
  assert.equal(
    view.status,
    "released",
    `${key} ends released, got ${view.status}`,
  );
  runs[key] = runId;
  log(`${key}: released run ${runId} (mode ${view.mode})`);
}

// The expected headline (sample-result.json) for the full form, read back from
// local D1 (reading only; the loader never writes the database itself).
{
  const out = await localSql(
    `SELECT result_json FROM run_results WHERE run_id = '${runs.E}'`,
  );
  const row = JSON.parse(out.slice(out.indexOf("[")))[0].results[0];
  const result = JSON.parse(row.result_json);
  const h = result.result.headline;
  const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
  assert.equal(result.meta.mode, "stub", "scripted-model runs are STUB");
  assert(
    near(h.npv.capacity_inclusive, EXPECTED.npvCapacityInclusive),
    `NPV capacity ${h.npv.capacity_inclusive}`,
  );
  assert(near(h.npv.hard, EXPECTED.npvHard), `NPV hard ${h.npv.hard}`);
  assert(
    near(
      h.payback.capacity_inclusive.years,
      EXPECTED.paybackCapacityYears,
      0.05,
    ),
    `payback ${h.payback.capacity_inclusive.years}`,
  );
  assert(
    near(
      result.result.confidence.project.confidence,
      EXPECTED.projectConfidence,
      0.0005,
    ),
    `confidence ${JSON.stringify(result.result.confidence?.project)}`,
  );
  log(
    `E headline matches sample-result.json (NPV ${h.npv.capacity_inclusive})`,
  );
}

const report = await post(
  `/projects/${projects.F}/runs/${runs.F}/reports`,
  owner.cookie,
  {},
);
assert.equal(report.status, 302, `F report: ${report.status}`);
log("F: report generated");

const accounts = {
  origin,
  tag,
  password: PASSWORD,
  owner: owner.email,
  member: member.email,
  outsider: outsider.email,
  projects,
  runs,
  files: OUT_DIR,
};
const out = resolve(".wrangler", "local-demo", "accounts.json");
writeFileSync(out, JSON.stringify(accounts, null, 2));
console.log(JSON.stringify(accounts, null, 2));
console.log(`written to ${out} (${basename(out)})`);
