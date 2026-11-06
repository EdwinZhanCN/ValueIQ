// Local Worker for runtime checks: applies local D1 migrations, starts
// `react-router dev` on a free port, and stops it. Never touches remote D1.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export function cli(packagePath, args, options = {}) {
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

/** Runs wrangler and resolves with its output, or rejects on failure. */
export async function wrangler(args) {
  const child = cli("wrangler/bin/wrangler.js", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`wrangler ${args.join(" ")}:\n${output}`);
  return output;
}

/** Runs one SQL statement against local D1. */
export function localSql(command) {
  return wrangler([
    "d1",
    "execute",
    "valueiq",
    "--local",
    "--json",
    "--command",
    command,
  ]);
}

export async function startDevServer(port) {
  if (!existsSync(".dev.vars")) {
    throw new Error(
      "Missing .dev.vars: copy .dev.vars.example and set BETTER_AUTH_SECRET.",
    );
  }
  await wrangler(["d1", "migrations", "apply", "valueiq", "--local"]);

  // Never mistake another application's response for our test server.
  const probe = createServer();
  probe.listen(port, "127.0.0.1");
  await once(probe, "listening");
  await new Promise((done) => probe.close(done));

  const origin = `http://127.0.0.1:${port}`;
  const child = cli(
    "@react-router/dev/bin.cjs",
    ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const server = { origin, child, logs: "" };
  const log = (chunk) => (server.logs = (server.logs + chunk).slice(-20000));
  child.stdout.on("data", log);
  child.stderr.on("data", log);

  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null)
      throw new Error(`Dev server exited: ${child.exitCode}\n${server.logs}`);
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return server;
    } catch {
      /* The server is still starting. */
    }
    await delay(250);
  }
  await stopDevServer(server);
  throw new Error(`Dev server startup timed out\n${server.logs}`);
}

export async function stopDevServer(server) {
  const child = server?.child;
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    await once(killer, "exit");
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
  await exited;
}
