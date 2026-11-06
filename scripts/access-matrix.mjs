// Access matrix (interim-foundation validation): every project route is
// checked as four actors against a real local Worker and local D1.
//
//   signed out → redirect to /sign-in?redirectTo=<path>
//   other team → 404
//   member     → allowed
//   owner      → allowed
//
// To cover a new project route, append an entry to `TARGETS`. Anything the
// route needs (an uploaded file, say) goes in `setup`, which runs once as the
// owner and can add fields to the shared fixture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openAgentSocket } from "./agent-socket.mjs";
import { localSql, startDevServer, stopDevServer } from "./dev-server.mjs";

const port = Number(process.env.VALUEIQ_SMOKE_PORT ?? 5179);
assert(
  Number.isInteger(port) && port > 0 && port < 65536,
  "Invalid smoke port",
);

const ACTORS = ["signedOut", "outsider", "member", "owner"];

/**
 * @typedef {{ status: number, location: string | null, body: string }} Result
 * @typedef {{
 *   name: string,
 *   setup?: (fx: object, call: Function) => Promise<void>,
 *   request: (fx: object, actor: string) => { path: string, method?: string, form?: Record<string, string> },
 *   allowed: (result: Result, fx: object, actor: string, call: Function) => Promise<void> | void,
 * }} Target
 */

/** @type {Target[]} */
const TARGETS = [
  {
    name: "project page",
    request: (fx) => ({ path: `/projects/${fx.projectId}` }),
    allowed: (result, fx) => {
      assert.equal(result.status, 200, result.body.slice(0, 400));
      assert(result.body.includes(fx.projectName), "Project name missing");
    },
  },
  {
    name: "persisted result page",
    setup: async (fx) => {
      const output = JSON.parse(
        readFileSync("docs/research/samples/sample-result.json", "utf8"),
      );
      fx.runId = `${fx.run}-result`;
      output.meta.run_id = fx.runId;
      const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
      await localSql(
        `INSERT INTO runs(id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by,finished_at) VALUES(${q(fx.runId)},${q(fx.projectId)},'released','stub','matrix','1','0.1','s1',${q(fx.users.owner)},1)`,
      );
      await localSql(
        `INSERT INTO run_results(run_id,result_json) VALUES(${q(fx.runId)},${q(JSON.stringify(output))})`,
      );
    },
    request: (fx) => ({
      path: `/projects/${fx.projectId}/results?run=${fx.runId}`,
    }),
    allowed: (result) => {
      assert.equal(result.status, 200, result.body.slice(0, 400));
      assert.match(result.body, /127,956\.73/);
      assert.match(result.body, /STUB/);
    },
  },
  {
    name: "report generation action",
    request: (fx) => ({
      path: `/projects/${fx.projectId}/runs/${fx.runId}/reports`,
      method: "POST",
    }),
    allowed: (result, fx) => {
      assert.equal(result.status, 302, result.body.slice(0, 400));
      fx.reportId = new URL(
        result.location,
        "http://local.test",
      ).searchParams.get("report");
      assert(fx.reportId);
    },
  },
  {
    name: "private report download",
    request: (fx) => ({
      path: `/projects/${fx.projectId}/runs/${fx.runId}/reports/${fx.reportId}`,
    }),
    allowed: (result) => {
      assert.equal(result.status, 200, result.body.slice(0, 400));
      assert.match(result.body, /^%PDF-/);
    },
  },
  {
    name: "form save action",
    request: (fx, actor) => ({
      path: `/projects/${fx.projectId}`,
      method: "POST",
      form: { formJson: JSON.stringify({ marker: `${fx.run}-${actor}` }) },
    }),
    allowed: async (result, fx, actor, call) => {
      assert.equal(result.status, 200, result.body.slice(0, 400));
      // The round trip: the owner loads what this actor saved.
      const page = await call("owner", { path: `/projects/${fx.projectId}` });
      assert(page.body.includes(`${fx.run}-${actor}`), "Saved form not loaded");
    },
  },
  {
    name: "file upload action",
    request: (fx, actor) => {
      const body = new FormData();
      body.set("file", new Blob([`${fx.run}-${actor}`]), `${actor}.txt`);
      body.set("description", `Uploaded by ${actor}`);
      return { path: `/projects/${fx.projectId}/files`, method: "POST", body };
    },
    allowed: (result) => {
      assert.equal(result.status, 201, result.body.slice(0, 400));
    },
  },
  {
    name: "file download",
    // The owner uploads the file every actor then asks for.
    setup: async (fx, call) => {
      const body = new FormData();
      body.set("file", new Blob([`${fx.run}-file`]), "matrix.txt");
      body.set("description", "Matrix fixture");
      const result = await call("owner", {
        path: `/projects/${fx.projectId}/files`,
        method: "POST",
        body,
      });
      assert.equal(result.status, 201, `upload: ${result.body.slice(0, 400)}`);
      fx.fileId = JSON.parse(result.body).file.id;
    },
    request: (fx) => ({ path: `/projects/${fx.projectId}/files/${fx.fileId}` }),
    allowed: (result, fx) => {
      assert.equal(result.status, 200, result.body.slice(0, 400));
      assert.equal(result.body, `${fx.run}-file`, "Downloaded bytes differ");
    },
  },
];

let server;

try {
  server = await startDevServer(port);
  const { origin } = server;
  const cookies = { signedOut: "" };

  async function call(actor, { path, method = "GET", form, body }) {
    const response = await fetch(origin + path, {
      method,
      redirect: "manual",
      headers: {
        origin,
        cookie: cookies[actor],
        ...(form && { "content-type": "application/x-www-form-urlencoded" }),
      },
      body: body ?? (form && new URLSearchParams(form)),
      signal: AbortSignal.timeout(15000),
    });
    return {
      status: response.status,
      location: response.headers.get("location"),
      body: await response.text(),
    };
  }

  async function authPost(path, cookie, body) {
    const response = await fetch(origin + path, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    assert.equal(response.status, 200, `${path}: ${text}`);
    const setCookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return { json: JSON.parse(text), cookie: setCookie || cookie };
  }

  // Three accounts: the owner's team, a member the owner adds by email on
  // /team, and an outsider with a team of their own. A fourth account has no
  // team yet.
  const run = `matrix-${Date.now()}`;
  const users = {};
  for (const actor of ["owner", "member", "outsider", "teamless"]) {
    const { json, cookie } = await authPost("/api/auth/sign-up/email", "", {
      email: `${run}-${actor}@example.test`,
      password: "matrix-password-1",
      name: actor,
    });
    users[actor] = json.user.id;
    cookies[actor] = cookie;
  }
  await authPost("/api/auth/organization/create", cookies.owner, {
    name: `${run} team`,
    slug: `${run}-team`,
  });
  await authPost("/api/auth/organization/create", cookies.outsider, {
    name: `${run} other`,
    slug: `${run}-other`,
  });
  const added = await call("owner", {
    path: "/team",
    method: "POST",
    form: { email: `${run}-member@example.test` },
  });
  assert.equal(added.status, 200, `add member: ${added.body.slice(0, 400)}`);

  // Pages without a project: sign-in first, then the active team's list.
  for (const path of ["/projects", "/projects/new"]) {
    const result = await call("signedOut", { path });
    assertSignInRedirect(result, path);
    const teamless = await call("teamless", { path });
    assert.equal(teamless.location, "/teams/new", `${path} without a team`);
  }
  const projectName = `${run} project`;
  const created = await call("owner", {
    path: "/projects/new",
    method: "POST",
    form: { name: projectName, goals: "Capacity\nQuality" },
  });
  assert.equal(created.status, 302, `create: ${created.body.slice(0, 400)}`);
  const projectId = created.location?.match(/^\/projects\/([\w-]+)$/)?.[1];
  assert(projectId, `create redirected to ${created.location}`);
  const fx = { run, projectId, projectName, users };

  for (const actor of ACTORS.slice(1)) {
    const list = await call(actor, { path: "/projects" });
    assert.equal(list.status, 200, `${actor} /projects`);
    assert.equal(
      list.body.includes(projectName),
      actor !== "outsider",
      `${actor} /projects lists the wrong team`,
    );
  }
  const missing = await call("owner", { path: "/projects/no-such-project" });
  assert.equal(missing.status, 404, "Missing project is not 404");

  const rows = [];
  for (const target of TARGETS) {
    await target.setup?.(fx, call);
    for (const actor of ACTORS) {
      const request = target.request(fx, actor);
      const result = await call(actor, request);
      const label = `${target.name} as ${actor}`;
      try {
        if (actor === "signedOut") assertSignInRedirect(result, request.path);
        else if (actor === "outsider")
          assert.equal(result.status, 404, "expected 404");
        else await target.allowed(result, fx, actor, call);
      } catch (error) {
        error.message = `${label}: ${error.message}`;
        throw error;
      }
      rows.push(`${label}: ${result.status}`);
    }
  }

  // Denied saves left nothing behind: the owner's save is the last one.
  const saved = JSON.parse(
    await localSql(
      `SELECT form_json, updated_by FROM project_forms WHERE project_id = '${projectId}'`,
    ).then((output) => output.slice(output.indexOf("["))),
  )[0].results[0];
  assert.deepEqual(JSON.parse(saved.form_json), { marker: `${run}-owner` });
  assert.equal(saved.updated_by, users.owner);

  // Denied uploads left nothing behind either.
  const uploaders = JSON.parse(
    await localSql(
      `SELECT DISTINCT uploaded_by FROM files WHERE project_id = '${projectId}'`,
    ).then((output) => output.slice(output.indexOf("["))),
  )[0].results.map((row) => row.uploaded_by);
  assert.deepEqual(uploaders.sort(), [users.member, users.owner].sort());

  // Agent routes (integration contract section 7): the gate answers 401 and
  // 404 itself; team members get through to the agent, over HTTP and as a
  // WebSocket.
  const agentPath = `/agents/value-i-q-agent/${projectId}`;
  const agentExpect = { signedOut: 401, outsider: 404 };
  for (const actor of ACTORS) {
    const http = await call(actor, { path: agentPath });
    if (actor in agentExpect) {
      assert.match(
        http.body,
        /^(Unauthorized|Not found)$/,
        `${actor}: not the gate`,
      );
    }
    const opened = await openSocket(origin, agentPath, cookies[actor], origin);
    const label = `agent as ${actor}`;
    if (actor in agentExpect) {
      assert.equal(http.status, agentExpect[actor], `${label} (HTTP)`);
      assert.equal(opened, false, `${label}: WebSocket opened`);
    } else {
      // Past the gate. The empty agent's own HTTP answer is still 404
      // "Not implemented" until it handles requests; the gate's is "Not found".
      assert(![401, 403].includes(http.status), `${label}: ${http.status}`);
      assert.notEqual(http.body, "Not found", `${label}: stopped at the gate`);
      assert.equal(opened, true, `${label}: WebSocket refused`);
    }
    rows.push(
      `${label}: ${http.status}, socket ${opened ? "open" : "refused"}`,
    );
  }
  // Another site's page cannot use the owner's cookie.
  const foreign = await fetch(origin + agentPath, {
    headers: { origin: "https://evil.example", cookie: cookies.owner },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(foreign.status, 403, "cross-site agent request");
  assert.equal(
    await openSocket(origin, agentPath, cookies.owner, "https://evil.example"),
    false,
    "cross-site WebSocket opened",
  );
  // Only ValueIQAgent is routable, and a missing project looks like another team's.
  const missingAgent = await call("owner", {
    path: "/agents/value-i-q-agent/no-such-project",
  });
  assert.equal(missingAgent.status, 404, "missing project agent");

  // Callable methods over a live socket (agent methods answer with typed results).
  for (const actor of ["member", "owner"]) {
    const ws = await openAgentSocket(origin, agentPath, cookies[actor], {
      // A client-sent copy of the header must be overwritten by the gate.
      "x-valueiq-user-id": users.outsider,
    });
    const wsLabel = `agent websocket as ${actor}`;
    {
      assert.equal(ws.opened, true, `${wsLabel}: connection refused`);
      const state = await ws.state();
      assert.equal(state.status, "idle", `${wsLabel}: initial state`);
      // Not supported while ask_user is tabled.
      const answer = await ws.rpc("answerQuestion", ["q1", "value"]);
      assert.equal(answer.ok, false);
      assert.equal(answer.error.code, "NOT_SUPPORTED");
      // Before a form is saved the member gets BAD_INPUT, not ACCESS_DENIED:
      // the forged header above did not become the connection's user id.
      if (actor === "member") {
        const start = await ws.rpc("startRun", []);
        assert.equal(start.ok, false);
        assert.equal(start.error.code, "BAD_INPUT", JSON.stringify(start));
        const cancel = await ws.rpc("cancelRun", []);
        assert.equal(cancel.ok, true);
      }
      ws.close();
    }
    rows.push(`${wsLabel}: open`);
  }

  // Workflow plumbing, only when no Gemini key is configured locally (so this
  // never calls the model): a saved form starts a real run, the workflow fails
  // it as MODEL_ERROR, and the run row, event and agent state say so. Nothing
  // is faked. Delete the key from .dev.vars to run this block.
  if (!/^GEMINI_API_KEY=/m.test(readFileSync(".dev.vars", "utf8"))) {
    const form = readFileSync(
      "docs/research/samples/sample-result.form.json",
      "utf8",
    );
    const saved = await call("owner", {
      path: `/projects/${projectId}`,
      method: "POST",
      form: { formJson: form },
    });
    assert.equal(saved.status, 200, "save sample form");
    const live = await openAgentSocket(origin, agentPath, cookies.owner, {});
    const start = await live.rpc("startRun", []);
    assert.equal(start.ok, true, JSON.stringify(start));
    const runId = start.value.run_id;
    assert(runId, "startRun returned no run id");
    let status = "";
    for (let i = 0; i < 40 && status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const out = JSON.parse(
        (
          await localSql(`SELECT status FROM runs WHERE id = '${runId}'`)
        ).replace(/^[^[]*/, ""),
      );
      status = out[0].results[0].status;
    }
    assert.equal(status, "failed", "run without a key should fail");
    const state = await live.state();
    assert(["running", "failed"].includes(state.status));
    // Same form again: a failed run does not block a new one.
    const again = await live.rpc("startRun", []);
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.notEqual(again.value.run_id, runId, "failed run was reused");
    live.close();
    rows.push("agent workflow run without a key: failed (MODEL_ERROR)");
  }

  // A user who leaves the team loses callable access on a live connection.
  {
    const live = await openAgentSocket(origin, agentPath, cookies.member, {});
    assert.equal(live.opened, true, "member socket before removal");
    await localSql(
      `DELETE FROM member WHERE user_id = '${users.member}' AND organization_id IN (SELECT team_id FROM projects WHERE id = '${projectId}')`,
    );
    const start = await live.rpc("startRun", []);
    assert.equal(start.ok, false);
    assert.equal(start.error.code, "ACCESS_DENIED", JSON.stringify(start));
    live.close();
  }

  console.log(rows.join("\n"));
  console.log(
    `Access matrix passed: ${TARGETS.length} targets × ${ACTORS.length} actors.`,
  );
} catch (error) {
  if (server) console.error(server.logs);
  throw error;
} finally {
  await stopDevServer(server);
}

/** True when the WebSocket handshake succeeds, false when it is refused. */
function openSocket(origin, path, cookie, fromOrigin) {
  const url = origin.replace(/^http/, "ws") + path;
  return new Promise((resolve) => {
    const socket = new WebSocket(url, {
      headers: { origin: fromOrigin, ...(cookie && { cookie }) },
    });
    const timer = setTimeout(() => {
      socket.close();
      resolve(false);
    }, 10000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      socket.close();
      resolve(true);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function assertSignInRedirect(result, path) {
  assert.equal(result.status, 302, `expected redirect, got ${result.status}`);
  assert.equal(
    result.location,
    `/sign-in?redirectTo=${encodeURIComponent(path)}`,
  );
}
