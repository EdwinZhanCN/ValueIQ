// Integration test against an explicitly selected, already-running LOCAL Worker.
// Only this harness seeds STUB engine rows via local D1; there is no browser
// endpoint for submitting or fabricating calculated output.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const origin = process.env.VALUEIQ_TEST_ORIGIN ?? "http://127.0.0.1:5187";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
  "Local tests only",
);
const dir = "/tmp/valueiq-output-pipeline-tests";
await mkdir(dir, { recursive: true });
const jars = new Map();
const suffix = randomUUID().slice(0, 8);
async function call(
  path,
  { actor = "owner", method = "GET", body, originHeader = origin } = {},
) {
  const jar = jars.get(actor) ?? new Map();
  const headers = {
    cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
  };
  if (method !== "GET" && originHeader !== null) headers.origin = originHeader;
  if (body instanceof URLSearchParams)
    headers["content-type"] = "application/x-www-form-urlencoded";
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(origin + path, {
    method,
    body,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  jars.set(actor, jar);
  return response;
}
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
async function sql(statement) {
  const file = resolve(dir, "seed.sql");
  await writeFile(file, statement);
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/wrangler/bin/wrangler.js"),
      "d1",
      "execute",
      "valueiq",
      "--local",
      "--file",
      file,
    ],
    { stdio: "pipe", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
}
const actors = {};
for (const actor of ["owner", "member", "outsider"]) {
  const email = `pipeline-${actor}-${suffix}@example.test`;
  const response = await call("/api/auth/sign-up/email", {
    actor,
    method: "POST",
    body: { name: actor, email, password: "pipeline-local-password-123" },
  });
  assert.equal(response.status, 200, await response.text());
  const session = await call("/api/auth/get-session", { actor });
  actors[actor] = { id: (await session.json()).user.id, email };
}
for (const actor of ["owner", "outsider"]) {
  const response = await call("/api/auth/organization/create", {
    actor,
    method: "POST",
    body: { name: `Pipeline ${actor}`, slug: `pipeline-${actor}-${suffix}` },
  });
  assert.equal(response.status, 200, await response.text());
}
const added = await call("/team", {
  method: "POST",
  body: new URLSearchParams({ email: actors.member.email }),
});
assert.equal(added.status, 200);
const created = await call("/projects/new", {
  method: "POST",
  body: new URLSearchParams({ name: `Pipeline project ${suffix}` }),
});
assert.equal(created.status, 302, await created.text());
const project = created.headers.get("location").split("/").at(-1);
const otherCreated = await call("/projects/new", {
  actor: "outsider",
  method: "POST",
  body: new URLSearchParams({ name: "Other team project" }),
});
assert.equal(otherCreated.status, 302);
const otherProject = otherCreated.headers.get("location").split("/").at(-1);
const before = await call(`/projects/${project}/results`);
assert((await before.text()).includes("No result yet"));
const form = {
  answers: { hours_saved_per_staff_week: 5 },
  note: "Preserve this answer",
};
const saved = await call(`/projects/${project}`, {
  method: "POST",
  body: new URLSearchParams({ formJson: JSON.stringify(form) }),
});
assert.equal(saved.status, 200, await saved.text());
// A numeric field link on Intake hands off to its Clarify card.
const handoff = await call(
  `/projects/${project}?input=hours_saved_per_staff_week`,
);
assert.equal(handoff.status, 302);
assert.match(
  handoff.headers.get("location") ?? "",
  /\/clarify\?input=hours_saved_per_staff_week$/,
);
const stored = await call(`/projects/${project}`);
assert((await stored.text()).includes("Preserve this answer"));
const source = JSON.parse(
  await readFile("docs/research/samples/sample-result.json", "utf8"),
);
const gap = JSON.parse(
  await readFile("docs/research/samples/sample-gap-list.json", "utf8"),
);
const run = randomUUID(),
  gapRun = randomUUID(),
  pending = randomUUID();
source.meta.run_id = run;
gap.meta.run_id = gapRun;
const at = Date.now();
const insert = (id, status, output, time) =>
  `INSERT INTO runs(id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by,started_at,finished_at) VALUES(${q(id)},${q(project)},${q(status)},'stub','test-fixture-input-hash','1','0.1','s1',${q(actors.owner.id)},${time},${status === "running" ? "NULL" : time});${output ? `INSERT INTO run_results(run_id,result_json,gap_list_json) VALUES(${q(id)},${output.kind === "result" ? q(JSON.stringify(output)) : "NULL"},${output.kind === "gap_list" ? q(JSON.stringify(output)) : "NULL"});` : ""}`;
await sql(insert(run, "released", source, at));
for (const actor of ["owner", "member"]) {
  const response = await call(`/projects/${project}/results`, { actor });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(
    html.includes("-$18,641.93") &&
      html.includes("$127,956.73") &&
      html.includes("STUB"),
  );
}
for (const actor of ["outsider", "anonymous"]) {
  const response = await call(`/projects/${project}/results`, { actor });
  assert.equal(response.status, actor === "anonymous" ? 302 : 404);
}
const deniedSave = await call(`/projects/${project}`, {
  actor: "outsider",
  method: "POST",
  body: new URLSearchParams({ formJson: "{}" }),
});
assert.equal(deniedSave.status, 404);
assert(
  (await (await call(`/projects/${project}`)).text()).includes(
    "Preserve this answer",
  ),
);
const csrf = await call(`/projects/${project}/runs/${run}/reports`, {
  method: "POST",
  originHeader: null,
});
assert.equal(csrf.status, 403);
const generated = await call(`/projects/${project}/runs/${run}/reports`, {
  method: "POST",
});
assert.equal(generated.status, 302, await generated.text());
const report = new URL(
  generated.headers.get("location"),
  origin,
).searchParams.get("report");
assert(report);
const reportPath = `/projects/${project}/runs/${run}/reports/${report}`;
const download = await call(reportPath);
assert.equal(download.status, 200);
assert.equal(download.headers.get("content-type"), "application/pdf");
assert.equal(download.headers.get("cache-control"), "private, no-store");
const pdf = Buffer.from(await download.arrayBuffer());
assert(pdf.subarray(0, 5).equals(Buffer.from("%PDF-")));
await writeFile(resolve(dir, "stored-report.pdf"), pdf);
const memberPdf = await call(reportPath, { actor: "member" });
assert.equal(memberPdf.status, 200);
assert.deepEqual(Buffer.from(await memberPdf.arrayBuffer()), pdf);
for (const actor of ["outsider", "anonymous"]) {
  assert.equal(
    (await call(reportPath, { actor })).status,
    actor === "anonymous" ? 302 : 404,
  );
  assert.equal(
    (
      await call(`/projects/${project}/runs/${run}/reports`, {
        actor,
        method: "POST",
      })
    ).status,
    actor === "anonymous" ? 302 : 404,
  );
}
assert.equal(
  (
    await call(`/projects/${otherProject}/runs/${run}/reports/${report}`, {
      actor: "outsider",
    })
  ).status,
  404,
);
await call(`/projects/${project}`, {
  method: "POST",
  body: new URLSearchParams({
    formJson: JSON.stringify({ ...form, note: "Changed after report" }),
  }),
});
assert.deepEqual(
  Buffer.from(await (await call(reportPath)).arrayBuffer()),
  pdf,
  "Saved report was rewritten by input edits",
);
await sql(insert(gapRun, "gap_list", gap, at + 1000));
const gaps = await call(`/projects/${project}/results`);
const gapHtml = await gaps.text();
assert(!gapHtml.includes('data-testid="headline"'));
assert(gapHtml.includes("hours_saved_per_staff_week"));
assert(!gapHtml.includes("Generate and save PDF"));
assert.equal(
  (
    await call(`/projects/${project}/runs/${gapRun}/reports`, {
      method: "POST",
    })
  ).status,
  409,
);
const legacy = await call(`/projects/${project}/results?run=${run}&tab=report`);
assert.equal(legacy.status, 302);
assert.equal(
  legacy.headers.get("location"),
  `/projects/${project}/report?run=${run}`,
);
const pinned = await call(`/projects/${project}/report?run=${run}`);
const pinHtml = await pinned.text();
assert(pinHtml.includes("$127,956.73") && pinHtml.includes(report));
await sql(insert(pending, "running", null, at + 2000));
const running = await call(`/projects/${project}/results`);
const runningHtml = await running.text();
assert(
  runningHtml.includes("The run is still working") &&
    !runningHtml.includes('data-testid="headline"'),
);
const invalidId = randomUUID();
const bad = structuredClone(source);
bad.meta.run_id = invalidId;
bad.meta.contract_version = "999";
await sql(insert(invalidId, "released", bad, at + 3000));
assert.equal(
  (await call(`/projects/${project}/results?run=${invalidId}`)).status,
  500,
);
const fixture = {
  origin,
  project,
  run,
  gapRun,
  pending,
  report,
  reportPath,
  sha256: createHash("sha256").update(pdf).digest("hex"),
  jars: Object.fromEntries(
    [...jars].map(([actor, jar]) => [actor, Object.fromEntries(jar)]),
  ),
};
await writeFile(resolve(dir, "fixture.json"), JSON.stringify(fixture));
console.log(
  "PASS: authenticated D1 result retrieval, saved intake retention, pinned run history, R2 PDF generation/download, four-actor access checks, CSRF rejection, failed-gate/pending suppression and invalid-contract rejection.",
);
