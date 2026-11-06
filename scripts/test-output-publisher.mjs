// Exercise the real server publication functions in an isolated local workerd.
// This worker is constructed by the test, never routed by the application.
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
const require = createRequire(
  realpathSync("node_modules/wrangler/package.json"),
);
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { build } = require("esbuild");
const directory = await mkdtemp(join(tmpdir(), "valueiq-publisher-"));
const entry = join(directory, "worker.mjs");
await build({
  stdin: {
    contents: `import {createRun,finishRun,getRun} from ${JSON.stringify(resolve("app/server/runs.server.ts"))};
const access={userId:"publisher-user",teamId:"publisher-team",projectId:"publisher-project",role:"owner"};
export default {async fetch(request){try{const body=await request.json();let result;switch(new URL(request.url).pathname){case "/create":result={id:await createRun(access,body)};break;case "/finish":result=await finishRun(access,body.id,body.output);break;case "/get":result=await getRun(access,body.id);break;default:return new Response(null,{status:404});}return Response.json(result);}catch(error){return new Response(error.message,{status:409});}}};`,
    resolveDir: process.cwd(),
    sourcefile: "publisher-test.ts",
    loader: "ts",
  },
  outfile: entry,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["cloudflare:workers"],
  logLevel: "silent",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: entry,
    modulesRoot: directory,
    compatibilityDate: "2026-09-11",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const file of [
    "drizzle/0000_auth_projects_files.sql",
    "drizzle/0001_equal_riptide.sql",
  ]) {
    for (const statement of (await readFile(file, "utf8")).split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) await db.prepare(statement.trim()).run();
    }
  }
  await db
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('publisher-user','Publisher','publisher@example.test',0,?,?)",
    )
    .bind(Date.now(), Date.now())
    .run();
  await db
    .prepare(
      "INSERT INTO organization(id,name,slug,created_at) VALUES('publisher-team','Publisher','publisher',?)",
    )
    .bind(Date.now())
    .run();
  await db
    .prepare(
      "INSERT INTO projects(id,team_id,name,created_by) VALUES('publisher-project','publisher-team','Publisher','publisher-user')",
    )
    .run();
  const source = JSON.parse(
    await readFile("docs/research/samples/sample-result.json", "utf8"),
  );
  const call = (path, body) =>
    mf.dispatchFetch(`http://local.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const create = async () => {
    const response = await call("/create", {
      mode: "stub",
      formHash: "fixture",
      contractVersion: "1",
      formulaVersion: "0.1",
      settingsVersion: "s1",
    });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).id;
  };
  const id = await create();
  const output = structuredClone(source);
  output.meta.run_id = id;
  assert.equal((await (await call("/get", { id })).json()).output, null);
  const both = await Promise.all([
    call("/finish", { id, output }),
    call("/finish", { id, output }),
  ]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  const snapshot = await (await call("/get", { id })).json();
  assert.equal(snapshot.run.status, "released");
  assert.deepEqual(snapshot.output, output);
  assert.equal(
    await db
      .prepare("SELECT count(*) AS n FROM run_results WHERE run_id=?")
      .bind(id)
      .first("n"),
    1,
  );
  const replay = structuredClone(output);
  replay.result.headline.npv.capacity_inclusive = 1;
  assert.equal((await call("/finish", { id, output: replay })).status, 409);
  assert.equal(
    (await (await call("/get", { id })).json()).output.result.headline.npv
      .capacity_inclusive,
    127956.73,
  );
  const cancelled = await create();
  await db
    .prepare("UPDATE runs SET status='cancelled' WHERE id=?")
    .bind(cancelled)
    .run();
  const cancelledOutput = structuredClone(source);
  cancelledOutput.meta.run_id = cancelled;
  assert.equal(
    (await call("/finish", { id: cancelled, output: cancelledOutput })).status,
    409,
  );
  assert.equal(
    await db
      .prepare("SELECT count(*) AS n FROM run_results WHERE run_id=?")
      .bind(cancelled)
      .first("n"),
    0,
  );
  const bad = await create();
  const invalid = structuredClone(source);
  invalid.meta.run_id = bad;
  invalid.result.confidence.project.confidence = 0.5;
  assert.equal(
    (await call("/finish", { id: bad, output: invalid })).status,
    409,
  );
  assert.equal(
    (await (await call("/get", { id: bad })).json()).run.status,
    "running",
  );
  console.log(
    "PASS: real workerd create/publish/read, concurrent completion, immutable terminal results, cancelled-run protection and failed-gate rejection.",
  );
} finally {
  await mf.dispose();
  await rm(directory, { recursive: true, force: true });
}
