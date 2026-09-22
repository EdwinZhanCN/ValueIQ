import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
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

  // The project and assessment UI routes are disconnected on purpose.
  await get("/projects", 404);

  console.log(
    "Smoke passed: landing chrome, fullscreen workspace, disconnected backend routes.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await stop();
}
