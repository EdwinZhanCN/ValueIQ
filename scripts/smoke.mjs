import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.VALUEIQ_SMOKE_PORT ?? 5179);
assert(
  Number.isInteger(port) && port > 0 && port < 65536,
  "Invalid smoke port",
);
const origin = `http://127.0.0.1:${port}`;
let server;
let logs = "";

function cli(packagePath, args, options = {}) {
  return spawn(
    process.execPath,
    [resolve("node_modules", packagePath), ...args],
    {
      env: {
        ...process.env,
        CI: "true",
        WRANGLER_SEND_METRICS: "false",
        // Keep wrangler's dev registry inside the project: the default
        // ~/.wrangler location is read-only in sandboxes and on some CI hosts.
        MINIFLARE_REGISTRY_PATH: resolve(".wrangler", "registry"),
      },
      ...options,
    },
  );
}

// Sign-up needs the local tables and a session secret. Migrations are
// idempotent, so apply them here rather than relying on earlier steps.
async function prepare() {
  if (!existsSync(".dev.vars")) {
    throw new Error(
      "Missing .dev.vars: copy .dev.vars.example and set BETTER_AUTH_SECRET.",
    );
  }
  const migrate = cli(
    "wrangler/bin/wrangler.js",
    ["d1", "migrations", "apply", "valueiq", "--local"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  migrate.stdout.on("data", (chunk) => (output += chunk));
  migrate.stderr.on("data", (chunk) => (output += chunk));
  const [code] = await once(migrate, "exit");
  if (code !== 0) throw new Error(`Local D1 migrations failed:\n${output}`);
}

async function start() {
  // Never mistake another application's response for our test server.
  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((done) => probe.close(done));
  server = cli(
    "@react-router/dev/bin.cjs",
    ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    logs = (logs + chunk).slice(-20000);
  });
  server.stderr.on("data", (chunk) => {
    logs = (logs + chunk).slice(-20000);
  });
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null)
      throw new Error(`Dev server exited: ${server.exitCode}`);
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return;
    } catch {
      /* The server is still starting. */
    }
    await delay(250);
  }
  throw new Error("Dev server startup timed out");
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  const child = server;
  const exited = once(child, "exit");
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    await once(killer, "exit");
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
  await exited;
  server = undefined;
}

async function get(path, expected = 200) {
  const response = await fetch(origin + path, {
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();
  assert.equal(response.status, expected, `${path}: ${html.slice(0, 400)}`);
  return html;
}

// Runs SQL against local D1, for rows no page creates yet (projects).
async function d1(sql) {
  const child = cli(
    "wrangler/bin/wrangler.js",
    ["d1", "execute", "valueiq", "--local", "--command", sql],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`Local D1 execute failed:\n${output}`);
}

// A signed-up account with its own team and one project in it.
async function teamWithProject(label) {
  const response = await fetch(origin + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      email: `smoke-${label}-${Date.now()}@example.test`,
      password: "smoke-password-1",
      name: label,
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `sign-up ${label}`);
  const userId = (await response.json()).user.id;
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const team = await fetch(origin + "/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify({ name: label, slug: `${label}-${Date.now()}` }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(
    team.status,
    200,
    `create team ${label}: ${await team.clone().text()}`,
  );
  const teamId = (await team.json()).id;
  const projectId = crypto.randomUUID();
  await d1(
    `INSERT INTO projects (id, team_id, name, created_by) VALUES ('${projectId}', '${teamId}', '${label}', '${userId}')`,
  );
  return { cookie, projectId };
}

function upload(owner, body, cookie = owner.cookie) {
  return fetch(`${origin}/projects/${owner.projectId}/files`, {
    method: "POST",
    headers: { origin, cookie },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
}

function download(projectId, fileId, cookie) {
  return fetch(`${origin}/projects/${projectId}/files/${fileId}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
}

try {
  await prepare();
  await start();

  // Marketing surface: site chrome, plus a way into the workspace.
  const landing = await get("/");
  assert.match(landing, /aria-label="Main"/, "Landing lost the site header");
  assert.match(landing, /Open workspace/, "Landing lost its workspace link");

  // Workspace surface: the interface owns the page, with no site chrome
  // wrapped around it.
  const workspace = await get("/workspace");
  assert.match(workspace, /STUB/, "Preview must label stub data");
  assert.match(workspace, /127,956\.73/);
  assert.match(workspace, /202\.9%/);
  assert.match(workspace, /169\.9%/);
  const gaps = await get("/workspace?view=gaps");
  assert(!gaps.includes("127,956.73"), "Gap exposed a headline");
  assert(
    !workspace.includes('aria-label="Main"'),
    "Workspace still renders the site header",
  );

  // Better Auth runs on local D1: sign-up returns a session the server reads
  // back. Better Auth rejects a POST without a matching Origin.
  const email = `smoke-${Date.now()}@example.test`;
  const signUp = await fetch(origin + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      email,
      password: "smoke-password-1",
      name: "Smoke",
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(signUp.status, 200, `sign-up: ${await signUp.text()}`);
  const cookie = signUp.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const session = await fetch(origin + "/api/auth/get-session", {
    headers: { cookie },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal((await session.json())?.user?.email, email, "No session");

  // Z1: accounts and teams through the pages' own forms. Better Auth and
  // React Router both expect a same-origin POST.
  const form = async (path, fields, jar = "") => {
    const response = await fetch(origin + path, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin,
        cookie: jar,
      },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(15000),
    });
    const set = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0]);
    return { response, jar: set.length ? set.join("; ") : jar };
  };
  const page = async (path, jar) => {
    const response = await fetch(origin + path, {
      redirect: "manual",
      headers: { cookie: jar },
      signal: AbortSignal.timeout(15000),
    });
    return { response, html: await response.text() };
  };
  const password = "smoke-password-1";
  const signUpPage = async (name) => {
    const address = `smoke-${name.toLowerCase()}-${Date.now()}@example.test`;
    const { response, jar } = await form("/sign-up", {
      name,
      email: address,
      password,
    });
    assert.equal(response.status, 302, `/sign-up ${name}`);
    assert.equal(response.headers.get("location"), "/teams/new");
    return { email: address, jar };
  };
  const owner = await signUpPage("Owner");
  const teammate = await signUpPage("Teammate");
  const outsider = await signUpPage("Outsider");

  const created = await form("/teams/new", { name: "Smoke team" }, owner.jar);
  assert.equal(created.response.status, 302, "/teams/new");
  assert.equal(created.response.headers.get("location"), "/team");
  const other = await form("/teams/new", { name: "Other" }, outsider.jar);
  assert.equal(other.response.status, 302, "second team");

  // The owner adds an existing account by email; /team lists it.
  const add = await form("/team", { email: teammate.email }, owner.jar);
  assert.equal(add.response.status, 200, "owner add by email");
  const team = await page("/team", owner.jar);
  assert.match(team.html, /Smoke team/, "/team lost the team name");
  assert(team.html.includes(teammate.email), "/team lacks the new member");
  assert(!team.html.includes(outsider.email), "/team shows another team");

  // A member cannot add people.
  const denied = await form("/team", { email: outsider.email }, teammate.jar);
  assert.equal(denied.response.status, 403, "member add must be refused");
  const after = await page("/team", owner.jar);
  assert(!after.html.includes(outsider.email), "member add went through");

  // Signed out: /team asks to sign in; sign-in honours only same-site paths.
  const out = await form("/sign-out", {}, owner.jar);
  assert.equal(out.response.status, 302, "/sign-out");
  const gated = await page("/team", "");
  assert.equal(
    gated.response.headers.get("location"),
    "/sign-in?redirectTo=%2Fteam",
  );
  const back = await form("/sign-in", {
    email: owner.email,
    password,
    redirectTo: "/team",
  });
  assert.equal(back.response.headers.get("location"), "/team");
  const offsite = await form("/sign-in", {
    email: owner.email,
    password,
    redirectTo: "//example.test/x",
  });
  assert.equal(offsite.response.headers.get("location"), "/projects");

  // Z2: /projects asks a signed-out visitor to sign in, and opens for the
  // owner signed back in.
  const projectsOut = await page("/projects", "");
  assert.equal(
    projectsOut.response.headers.get("location"),
    "/sign-in?redirectTo=%2Fprojects",
  );
  const projectsIn = await page("/projects", back.jar);
  assert.equal(projectsIn.response.status, 200, "/projects signed in");

  // Files: an upload/download round trip through local R2, a blank
  // description rejected, and no way into another team's file.
  const alpha = await teamWithProject("alpha");
  const beta = await teamWithProject("beta");
  const bytes = new TextEncoder().encode("cost,benefit\n10,25\n");
  const described = new FormData();
  described.set("file", new Blob([bytes], { type: "text/csv" }), "Q3 é.csv");
  described.set("description", "Quarterly costs");
  const uploaded = await upload(alpha, described);
  assert.equal(
    uploaded.status,
    201,
    `upload: ${await uploaded.clone().text()}`,
  );
  const fileId = (await uploaded.json()).file.id;

  // The project page is the light Intake step: goal cards, no numbers, and
  // the uploaded file grouped under its upload description.
  const intake = await page(`/projects/${alpha.projectId}`, alpha.cookie);
  assert.equal(intake.response.status, 200, "project page");
  assert.match(intake.html, /aria-label="Project intake"/, "intake form");
  assert.match(intake.html, /Save draft/, "intake save");
  assert.match(intake.html, /Continue to Clarify/, "intake continue");
  for (const goal of [
    "Time savings",
    "Data quality",
    "Decision speed",
    "Risk reduction",
  ])
    assert.match(
      intake.html,
      new RegExp(`aria-pressed="false"[^>]*>.*?${goal}`),
    );
  assert.doesNotMatch(intake.html, />(Revenue|Software)</, "removed goals");
  assert.doesNotMatch(intake.html, /inputMode="decimal"|inputmode="decimal"/);
  assert.match(intake.html, /Q3 é\.csv/, "intake lists the uploaded file");
  assert.match(intake.html, /Quarterly costs/, "file group description");
  // Number fields live on Clarify; links to them are sent there.
  const moved = await page(
    `/projects/${alpha.projectId}?input=staff_affected`,
    alpha.cookie,
  );
  assert.equal(moved.response.status, 302, "clarify input redirect");
  assert.equal(
    moved.response.headers.get("location"),
    `/projects/${alpha.projectId}/clarify?input=staff_affected`,
  );
  const kept = await page(
    `/projects/${alpha.projectId}?input=decision_statement`,
    alpha.cookie,
  );
  assert.equal(kept.response.status, 200, "intake input stays on intake");

  const fetched = await download(alpha.projectId, fileId, alpha.cookie);
  assert.equal(fetched.status, 200, "own download");
  assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()), bytes);
  assert.match(
    fetched.headers.get("content-disposition") ?? "",
    /^attachment; filename="Q3 _.csv"; filename\*=UTF-8''Q3%20%C3%A9\.csv$/,
  );

  const blank = new FormData();
  blank.set("file", new Blob([bytes], { type: "text/csv" }), "blank.csv");
  blank.set("description", "   ");
  assert.equal((await upload(alpha, blank)).status, 400, "blank description");

  // The 10 MB cap: exactly at the cap is accepted; one byte over fails the
  // file-size check, and a far larger body fails the Content-Length check.
  const cap = 10 * 1024 * 1024;
  for (const [size, expected, label] of [
    [cap, 201, "upload at the cap"],
    [cap + 1, 413, "upload one byte over the cap"],
    [cap + 1024 * 1024, 413, "upload with an oversized body"],
  ]) {
    const sized = new FormData();
    sized.set("file", new Blob([new Uint8Array(size)]), "sized.bin");
    sized.set("description", label);
    const response = await upload(alpha, sized);
    assert.equal(
      response.status,
      expected,
      `${label}: ${await response.text()}`,
    );
  }

  assert.equal(
    (await download(alpha.projectId, fileId, beta.cookie)).status,
    404,
    "other team's download",
  );
  assert.equal(
    (await download(beta.projectId, fileId, beta.cookie)).status,
    404,
    "file read through another project",
  );
  assert.equal(
    (await upload(alpha, described, beta.cookie)).status,
    404,
    "other team's upload",
  );
  const signedOut = await download(alpha.projectId, fileId);
  assert.equal(signedOut.status, 302, "signed-out download");
  assert.match(signedOut.headers.get("location") ?? "", /^\/sign-in/);

  // Clarify: no goals sends the user back to Intake; with goals it asks for
  // the defaults first, a ?input= target opens that field's question, and
  // Continue to Process waits for a form that passes validation.
  const clarifyPath = `/projects/${beta.projectId}/clarify`;
  const saveForm = async (form) => {
    const body = new URLSearchParams({ formJson: JSON.stringify(form) });
    const response = await fetch(`${origin}/projects/${beta.projectId}/form`, {
      method: "POST",
      headers: { origin, cookie: beta.cookie },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, `save form: ${await response.text()}`);
  };
  const noGoals = await page(clarifyPath, beta.cookie);
  assert.equal(noGoals.response.status, 200, "clarify without goals");
  assert.match(noGoals.html, /No goals yet/, "clarify empty state");
  assert.match(noGoals.html, /Back to Intake/, "clarify links to Intake");
  const draftForm = {
    version: 1,
    goals: ["time_savings"],
    currency: "USD",
    horizon_years: 3,
    inputs: [],
    file_descriptions: {},
    other_notes: "",
    measurement_plan: {},
    asked: [],
  };
  await saveForm(draftForm);
  const asking = await page(clarifyPath, beta.cookie);
  assert.equal(asking.response.status, 200, "clarify with goals");
  assert.match(asking.html, /aria-label="Clarify questions"/, "clarify cards");
  assert.match(asking.html, /Use industry defaults\?/, "defaults card first");
  assert.match(asking.html, /id="inputs-heading"/, "clarify inputs panel");
  assert.match(asking.html, /Before Process/, "clarify lists what is missing");
  assert.doesNotMatch(asking.html, /Stuck\?|Get help|Ask someone/);
  const targeted = await page(
    `${clarifyPath}?input=loaded_hourly_cost`,
    beta.cookie,
  );
  assert.match(
    targeted.html,
    /How much time will it save\?[\s\S]*id="value-loaded_hourly_cost"/,
    "?input= opens the field's question",
  );
  await saveForm({
    ...draftForm,
    inputs: [
      {
        id: "discount_rate_pct",
        value: 10,
        tier: "benchmark",
        origin: "default",
      },
      {
        id: "adoption_by_year",
        value: [50, 80, 90],
        tier: "estimate",
        origin: "user",
      },
      {
        id: "cost_one_time_vendor_license",
        value: 1000,
        tier: "estimate",
        origin: "user",
        basis: "quoted",
      },
      {
        id: "cost_annual_run",
        value: 100,
        tier: "estimate",
        origin: "user",
        basis: "estimated",
      },
    ],
  });
  const ready = await page(clarifyPath, beta.cookie);
  assert.doesNotMatch(ready.html, /Before Process/, "complete form");
  assert.match(ready.html, /Continue to Process/, "clarify continue");

  console.log(
    "Smoke passed: landing chrome, fullscreen workspace, sign-up session, account pages, /projects behind sign-in, file round trip, cap, and isolation.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
}
