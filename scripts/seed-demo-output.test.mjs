import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  createDemoStore,
  seedDemoOutput,
  renderDemoPdf,
} from "./seed-demo-output.mjs";
import { parseRunOutput } from "../shared/output.ts";

const projectId = "a6784de0-47cf-4ba4-9085-22b0fd73fa19";
const config = {
  env: {
    development: {
      name: "valueiq-dev",
      d1_databases: [
        { binding: "DB", database_name: "valueiq-dev", database_id: "dev" },
      ],
      r2_buckets: [{ binding: "FILES", bucket_name: "valueiq-dev-files" }],
    },
    production: { d1_databases: [{ database_id: "prod" }] },
  },
};
const form = JSON.parse(
  readFileSync("docs/research/samples/sample-result.form.json", "utf8"),
);
const template = JSON.parse(
  readFileSync("engine/fixtures/round1/r1-result.json", "utf8"),
);
const stub = parseRunOutput({
  ...template,
  meta: { ...template.meta, mode: "stub" },
});
const pdf = await renderDemoPdf(stub);

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const path of readdirSync("drizzle")
    .filter((p) => p.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(`drizzle/${path}`, "utf8"));
  db.exec(
    `INSERT INTO user(id,name,email) VALUES('owner','Owner','owner@example.test'); INSERT INTO organization(id,name,slug,created_at) VALUES('team','Team','team',0); INSERT INTO projects(id,team_id,name,created_by) VALUES('${projectId}','team','Existing project','owner'); INSERT INTO project_forms(project_id,form_json,updated_by) VALUES('${projectId}','{"existing_answers":true}','owner'); INSERT INTO runs(id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by,finished_at) VALUES('previous-run','${projectId}','released','real','previous','1','0.1','s1','owner',1);`,
  );
  const store = {
    ...createDemoStore((sql) => db.prepare(sql).all()),
    findProject: async (id) =>
      db
        .prepare("SELECT id,team_id,created_by FROM projects WHERE id=?")
        .get(id),
  };
  const bytes = new Map(),
    deleted = [];
  let renders = 0,
    n = 0;
  const input = {
    projectId,
    config: structuredClone(config),
    template,
    form,
    file: { fileId: "mock-upload" },
    store,
    objects: {
      put: async (key, data) => bytes.set(key, Buffer.from(data)),
      get: async (key) => bytes.get(key),
      delete: async (key) => {
        deleted.push(key);
        bytes.delete(key);
      },
    },
    renderPdf: async (output) => {
      renders++;
      assert.equal(output.meta.mode, "stub");
      return pdf;
    },
    newId: () => `seed-${++n}`,
    now: () => Date.parse("2026-11-06T12:00:00Z"),
  };
  return { db, input, bytes, deleted, renders: () => renders };
}

test("full UI seed publishes a STUB snapshot and valid PDF without changing prior data", async () => {
  const { db, input, bytes } = fixture();
  try {
    const out = await seedDemoOutput(input);
    assert.equal(out.mode, "stub");
    assert.equal(out.created, true);
    const run = db.prepare("SELECT * FROM runs WHERE id=?").get(out.runId);
    assert.equal(run.status, "released");
    assert.equal(run.mode, "stub");
    assert.deepEqual(JSON.parse(run.form_json), form);
    const stored = parseRunOutput(
      JSON.parse(
        db
          .prepare("SELECT result_json FROM run_results WHERE run_id=?")
          .get(out.runId).result_json,
      ),
    );
    assert.equal(stored.meta.mode, "stub");
    assert.equal(stored.meta.run_id, out.runId);
    assert.deepEqual(stored.result, stub.result);
    assert(stored.result.drivers[0].steps[0].inputs.length > 0);
    assert.equal(
      (await PDFDocument.load([...bytes.values()][0])).getPageCount(),
      (await PDFDocument.load(pdf)).getPageCount(),
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM run_reports WHERE run_id=?")
        .get(out.runId).n,
      1,
    );
    assert.equal(
      db.prepare("SELECT mode FROM runs WHERE id='previous-run'").get().mode,
      "real",
    );
    assert.equal(
      db.prepare("SELECT form_json FROM project_forms").get().form_json,
      '{"existing_answers":true}',
    );
    assert(out.resultsUrl.includes(`run=${out.runId}`));
    assert(out.reportUrl.endsWith(`/report?run=${out.runId}`));
  } finally {
    db.close();
  }
});

test("full UI reruns reuse the same run and report without overwriting history", async () => {
  const { db, input, renders, bytes } = fixture();
  try {
    const a = await seedDemoOutput(input),
      b = await seedDemoOutput(input);
    assert.equal(b.created, false);
    assert.equal(b.runId, a.runId);
    assert.equal(b.reportId, a.reportId);
    assert.equal(renders(), 1);
    assert.equal(bytes.size, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM runs").get().n, 2);
  } finally {
    db.close();
  }
});

test("a report metadata failure removes only the incomplete seed and its PDF", async () => {
  const { db, input, bytes, deleted } = fixture();
  input.store.saveDemoReport = async () => {
    throw Error("metadata denied");
  };
  try {
    await assert.rejects(seedDemoOutput(input), /metadata denied/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM runs").get().n, 1);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM run_results").get().n,
      0,
    );
    assert.equal(bytes.size, 0);
    assert.equal(deleted.length, 1);
    assert.equal(
      db.prepare("SELECT form_json FROM project_forms").get().form_json,
      '{"existing_answers":true}',
    );
  } finally {
    db.close();
  }
});

test("the headline remains unpublished until the result, report and provenance exist", async () => {
  const { db, input } = fixture();
  const release = input.store.releaseDemoRun;
  input.store.releaseDemoRun = async (row) => {
    assert.equal(
      db.prepare("SELECT status FROM runs WHERE id=?").get(row.id).status,
      "running",
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM run_results WHERE run_id=?")
        .get(row.id).n,
      1,
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM run_reports WHERE run_id=?")
        .get(row.id).n,
      1,
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM run_events WHERE run_id=?")
        .get(row.id).n,
      1,
    );
    await release(row);
  };
  try {
    await seedDemoOutput(input);
  } finally {
    db.close();
  }
});

test("a changed existing seeded outcome is rejected without deleting its report", async () => {
  const { db, input, bytes, deleted } = fixture();
  try {
    const out = await seedDemoOutput(input);
    const row = db
      .prepare("SELECT result_json FROM run_results WHERE run_id=?")
      .get(out.runId);
    const value = JSON.parse(row.result_json);
    value.result.headline.npv.hard = 123;
    db.prepare("UPDATE run_results SET result_json=? WHERE run_id=?").run(
      JSON.stringify(value),
      out.runId,
    );
    await assert.rejects(seedDemoOutput(input), /refusing to overwrite/);
    assert.equal(deleted.length, 0);
    assert.equal(bytes.size, 1);
  } finally {
    db.close();
  }
});
