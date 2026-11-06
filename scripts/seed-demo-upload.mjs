import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import {
  assertDemoTarget,
  createDemoStore,
  seedDemoOutput,
} from "./seed-demo-output.mjs";

export const filename = "MOCK-operations-evidence.csv";
export const description =
  "SYNTHETIC DEMO UPLOAD v1 — fictional operations inputs for UI/storage demonstration, not verified business evidence. Seeded administratively; file ownership follows the project creator.";
const origin = "https://valueiq-dev.zhanz.workers.dev";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** Only a new private upload is written; existing forms, runs and files are preserved. */
export async function seedDemoUpload({
  projectId,
  config,
  contents,
  store,
  objects,
  newId = randomUUID,
}) {
  assertDemoTarget(projectId, config);
  assert(contents.length > 0 && contents.length <= 10 * 1024 * 1024);
  assert(
    contents.toString("utf8").includes("SYNTHETIC_DEMO_ONLY"),
    "Synthetic marker required",
  );
  const project = await store.findProject(projectId);
  assert(
    project && project.id === projectId,
    "Project not found; nothing uploaded",
  );
  assert(/^[\w-]{1,128}$/.test(project.team_id), "Invalid team id");
  assert(
    typeof project.created_by === "string" && project.created_by,
    "Project creator missing",
  );
  const existing = await store.findUpload(projectId, filename, description);
  const id = existing?.id ?? newId();
  assert(/^[\w-]{1,128}$/.test(id), "Invalid file id");
  const key = `teams/${project.team_id}/projects/${projectId}/files/${id}`;
  if (existing) {
    assert.equal(
      existing.r2_key,
      key,
      "Existing upload is outside project namespace",
    );
    assert.equal(
      hash(await objects.get(key)),
      hash(contents),
      "Existing mock differs; refusing to overwrite it",
    );
  } else {
    await objects.put(key, contents);
    try {
      assert.equal(
        hash(await objects.get(key)),
        hash(contents),
        "R2 verification failed",
      );
      await store.insertUpload({
        id,
        projectId,
        key,
        name: filename,
        mime: "text/csv",
        size: contents.length,
        description,
        uploadedBy: project.created_by,
      });
    } catch (error) {
      await objects.delete(key);
      throw error;
    }
  }
  return {
    created: !existing,
    projectId,
    fileId: id,
    name: filename,
    size: contents.length,
    sha256: hash(contents),
    projectUrl: `${origin}/projects/${projectId}`,
    downloadUrl: `${origin}/projects/${projectId}/files/${id}`,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(
    process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REF === "refs/heads/develop",
    "Run only through the development seed workflow",
  );
  assert(
    !process.env.CLOUDFLARE_ENV,
    "Use the source config's development environment",
  );
  assert(
    process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID,
    "Development Cloudflare credentials required",
  );
  const parsed = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    await readFile("wrangler.jsonc", "utf8"),
  );
  assert(!parsed.error, "Invalid Worker configuration");
  const flags = ["--config", "wrangler.jsonc", "--env", "development"];
  const cli = (args, binary = false) =>
    execFileSync(
      process.execPath,
      [resolve("node_modules/wrangler/bin/wrangler.js"), ...args, ...flags],
      {
        encoding: binary ? undefined : "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 12 * 1024 * 1024,
      },
    );
  const query = (sql) => {
    const results = JSON.parse(
      cli(["d1", "execute", "DB", "--remote", "--json", "--command", sql]),
    );
    assert(results.length === 1 && results[0].success, "D1 operation failed");
    return results[0].results;
  };
  const store = {
    ...createDemoStore(query),
    findProject: async (id) =>
      query(
        `SELECT id,team_id,created_by FROM projects WHERE id=${q(id)}`,
      )[0] ?? null,
    findUpload: async (id, name, note) =>
      query(
        `SELECT id,r2_key FROM files WHERE project_id=${q(id)} AND name=${q(name)} AND description=${q(note)} LIMIT 1`,
      )[0] ?? null,
    insertUpload: async (row) => {
      query(
        `INSERT INTO files(id,project_id,r2_key,name,mime,size,description,uploaded_by) VALUES(${[row.id, row.projectId, row.key, row.name, row.mime, row.size, row.description, row.uploadedBy].map(q).join(",")})`,
      );
    },
  };
  const directory = await mkdtemp(join(tmpdir(), "valueiq-mock-upload-"));
  try {
    const objects = {
      put: async (key, bytes, mime = "text/csv") => {
        const file = join(
          directory,
          mime === "application/pdf" ? "MOCK-report.pdf" : filename,
        );
        await writeFile(file, bytes);
        cli([
          "r2",
          "object",
          "put",
          `valueiq-dev-files/${key}`,
          "--remote",
          "--file",
          file,
          "--content-type",
          mime,
        ]);
      },
      get: async (key) =>
        cli(
          [
            "r2",
            "object",
            "get",
            `valueiq-dev-files/${key}`,
            "--remote",
            "--pipe",
          ],
          true,
        ),
      delete: async (key) => {
        cli(["r2", "object", "delete", `valueiq-dev-files/${key}`, "--remote"]);
      },
    };
    const result = await seedDemoUpload({
      projectId: process.argv[2],
      config: parsed.config,
      contents: await readFile(`docs/research/output/${filename}`),
      store,
      objects,
    });
    const demo = await seedDemoOutput({
      form: JSON.parse(
        await readFile("docs/research/samples/sample-result.form.json", "utf8"),
      ),
      projectId: process.argv[2],
      config: parsed.config,
      template: JSON.parse(
        await readFile("engine/fixtures/round1/r1-result.json", "utf8"),
      ),
      file: result,
      store,
      objects,
    });
    console.log(JSON.stringify({ upload: result, output: demo }));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `Synthetic demo upload ${result.created ? "created" : "already present"}: [open project](${result.projectUrl}) · [mock file](${result.downloadUrl}). STUB output: [Numbers/Math/Charts](${demo.resultsUrl}) · [Report](${demo.reportUrl}) · [private PDF](${demo.downloadUrl}). File and PDF bytes verified. Existing intake and previous runs unchanged.\n`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
