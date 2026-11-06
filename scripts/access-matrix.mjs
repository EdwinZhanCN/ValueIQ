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

function assertSignInRedirect(result, path) {
  assert.equal(result.status, 302, `expected redirect, got ${result.status}`);
  assert.equal(
    result.location,
    `/sign-in?redirectTo=${encodeURIComponent(path)}`,
  );
}
