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
  assert.match(workspace, /Agent workspace/, "Workspace interface missing");
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

  // No project pages yet.
  await get("/projects", 404);

  console.log(
    "Smoke passed: landing chrome, fullscreen workspace, sign-up session, no project pages yet.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
}
