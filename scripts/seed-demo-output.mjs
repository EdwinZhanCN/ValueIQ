import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { parseRunOutput } from "../shared/output.ts";
import { renderEngineReport } from "../docs/research/output/pdf-preview/engine-report.mjs";

const origin = "https://valueiq-dev.zhanz.workers.dev";
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function assertDemoTarget(projectId, config) {
  assert(
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(projectId),
    "Expected a project UUID",
  );
  const dev = config.env?.development;
  assert.equal(dev?.name, "valueiq-dev", "Development Worker required");
  assert.equal(dev.d1_databases?.[0]?.binding, "DB");
  assert.equal(
    dev.d1_databases?.[0]?.database_name,
    "valueiq-dev",
    "Development database required",
  );
  assert(
    dev.d1_databases[0].database_id &&
      dev.d1_databases[0].database_id !==
        config.env?.production?.d1_databases?.[0]?.database_id,
    "Shared/missing database target",
  );
  assert.deepEqual(
    dev.r2_buckets,
    [{ binding: "FILES", bucket_name: "valueiq-dev-files" }],
    "Development bucket required",
  );
}

export async function renderDemoPdf(output) {
  assert.equal(output.meta.mode, "stub");
  const report = await renderEngineReport({
    PDFDocument,
    rgb,
    fontkit,
    fonts: {
      regular: await readFile("app/assets/report-regular.ttf"),
      bold: await readFile("app/assets/report-bold.ttf"),
    },
    data: output,
  });
  return Buffer.from(report.bytes);
}

/** Seed a separate immutable demo outcome, without editing any saved inputs. */
export async function seedDemoOutput({
  projectId,
  config,
  template,
  form,
  file,
  store,
  objects,
  renderPdf = renderDemoPdf,
  newId = randomUUID,
  now = Date.now,
}) {
  assertDemoTarget(projectId, config);
  const source = parseRunOutput({
    ...template,
    meta: { ...template.meta, mode: "stub" },
  });
  assert.equal(source.kind, "result", "A released-result fixture is required");
  assert(
    form && Array.isArray(form.goals) && Array.isArray(form.inputs),
    "Synthetic form snapshot required",
  );
  const marker = "demo-output-v1:" + hash(JSON.stringify({ source, form }));
  const project = await store.findProject(projectId);
  assert(project && project.id === projectId, "Project not found");
  assert(/^[\w-]{1,128}$/.test(project.team_id), "Invalid team id");
  const existing = await store.findDemoRun(projectId, marker);
  const id = existing?.id ?? newId(),
    reportId = existing?.report_id ?? newId();
  assert(
    /^[\w-]{1,128}$/.test(id) && /^[\w-]{1,128}$/.test(reportId),
    "Invalid demo identifiers",
  );
  const key = `teams/${project.team_id}/projects/${projectId}/reports/${id}/${reportId}.pdf`;
  let pdf;
  if (existing) {
    assert.equal(existing.report_key, key, "Report outside project namespace");
    const stored = parseRunOutput(JSON.parse(existing.result_json));
    assert.equal(stored.meta.mode, "stub");
    assert.equal(stored.meta.run_id, id);
    assert.deepEqual(
      JSON.parse(existing.form_json),
      form,
      "Existing demo form differs; refusing to overwrite it",
    );
    assert.equal(
      hash(JSON.stringify(stored.result)),
      hash(JSON.stringify(source.result)),
      "Existing demo differs; refusing to overwrite it",
    );
    pdf = await objects.get(key);
  } else {
    const startedAt = now();
    const output = parseRunOutput({
      ...source,
      meta: {
        ...source.meta,
        run_id: id,
        generated_at: new Date(startedAt).toISOString(),
      },
    });
    pdf = await renderPdf(output);
    assert(
      (await PDFDocument.load(pdf)).getPageCount() > 0,
      "Invalid demo PDF",
    );
    await objects.put(key, pdf, "application/pdf");
    let created = false;
    const record = {
      id,
      reportId,
      key,
      projectId,
      marker,
      form: structuredClone(form),
      output,
      createdBy: project.created_by,
      startedAt,
      audit: {
        mode: "stub",
        fixture: "engine/fixtures/round1/r1-result.json",
        fixture_hash: marker,
        mock_upload_file_id: file.fileId,
        note: "Synthetic fixture run. Existing saved intake is unchanged.",
      },
    };
    try {
      assert.equal(
        hash(await objects.get(key)),
        hash(pdf),
        "Stored demo PDF differs",
      );
      await store.createDemoRun(record);
      created = true;
      await store.saveDemoResult(record);
      await store.saveDemoReport(record);
      await store.saveDemoEvent(record);
      // A pending seed cannot expose a headline; publish only after all artifacts exist.
      await store.releaseDemoRun(record);
    } catch (error) {
      if (!created || (await store.removeIncompleteDemoRun(record)))
        await objects.delete(key);
      throw error;
    }
  }
  assert(
    (await PDFDocument.load(pdf)).getPageCount() > 0,
    "Stored demo PDF is invalid",
  );
  const resultsUrl = `${origin}/projects/${projectId}/results?run=${id}`;
  return {
    created: !existing,
    runId: id,
    reportId,
    mode: "stub",
    pdfSha256: hash(pdf),
    resultsUrl,
    reportUrl: `${resultsUrl}&tab=report`,
    downloadUrl: `${origin}/projects/${projectId}/runs/${id}/reports/${reportId}`,
  };
}

export function createDemoStore(query) {
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  return {
    findDemoRun: async (id, marker) =>
      query(
        `SELECT r.id,r.form_json,rr.result_json,rp.id AS report_id,rp.r2_key AS report_key FROM runs r JOIN run_results rr ON rr.run_id=r.id JOIN run_reports rp ON rp.run_id=r.id WHERE r.project_id=${q(id)} AND r.form_hash=${q(marker)} AND r.mode='stub' AND r.status='released' ORDER BY r.started_at DESC LIMIT 1`,
      )[0] ?? null,
    createDemoRun: async (r) => {
      query(
        `INSERT INTO runs(id,project_id,status,mode,form_hash,contract_version,formula_version,settings_version,started_by,started_at,form_json) VALUES(${[r.id, r.projectId, "running", "stub", r.marker, r.output.meta.contract_version, r.output.meta.formula_version, r.output.meta.settings_version, r.createdBy, r.startedAt, JSON.stringify(r.form)].map(q).join(",")})`,
      );
    },
    saveDemoResult: async (r) => {
      query(
        `INSERT INTO run_results(run_id,result_json) VALUES(${q(r.id)},${q(JSON.stringify(r.output))})`,
      );
    },
    saveDemoReport: async (r) => {
      query(
        `INSERT INTO run_reports(id,run_id,r2_key,created_by) VALUES(${[r.reportId, r.id, r.key, r.createdBy].map(q).join(",")})`,
      );
    },
    saveDemoEvent: async (r) => {
      query(
        `INSERT INTO run_events(run_id,seq,step,type,payload_json) VALUES(${q(r.id)},1,'Demo seed','demo_seed',${q(JSON.stringify(r.audit))})`,
      );
    },
    releaseDemoRun: async (r) => {
      const rows = query(
        `UPDATE runs SET status='released',finished_at=${q(Date.now())} WHERE id=${q(r.id)} AND project_id=${q(r.projectId)} AND mode='stub' AND form_hash=${q(r.marker)} AND status='running' AND EXISTS(SELECT 1 FROM run_results WHERE run_id=${q(r.id)}) AND EXISTS(SELECT 1 FROM run_reports WHERE run_id=${q(r.id)}) RETURNING id`,
      );
      assert.equal(rows[0]?.id, r.id, "Demo publication failed");
    },
    removeIncompleteDemoRun: async (r) =>
      query(
        `DELETE FROM runs WHERE id=${q(r.id)} AND project_id=${q(r.projectId)} AND mode='stub' AND form_hash=${q(r.marker)} AND status='running' RETURNING id`,
      ).length === 1,
  };
}
