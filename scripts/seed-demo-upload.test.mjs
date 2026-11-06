import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { seedDemoUpload, filename, description } from "./seed-demo-upload.mjs";

const projectId = "a6784de0-47cf-4ba4-9085-22b0fd73fa19";
const fileId = "11111111-1111-4111-8111-111111111111";
const contents = readFileSync(`docs/research/output/${filename}`);
const config = {
  env: {
    development: {
      name: "valueiq-dev",
      d1_databases: [
        {
          binding: "DB",
          database_name: "valueiq-dev",
          database_id: "development-db",
        },
      ],
      r2_buckets: [{ binding: "FILES", bucket_name: "valueiq-dev-files" }],
    },
    production: { d1_databases: [{ database_id: "production-db" }] },
  },
};

function fixture() {
  const state = {
    file: null,
    records: [],
    uploads: [],
    deleted: [],
    bytes: new Map(),
  };
  const store = {
    findProject: async (id) =>
      id === projectId
        ? { id, team_id: "demo-team", created_by: "project-owner" }
        : null,
    findUpload: async () => state.file,
    insertUpload: async (record) => {
      state.records.push(record);
      state.file = { id: record.id, r2_key: record.key };
    },
  };
  const objects = {
    put: async (key, bytes) => {
      state.uploads.push(key);
      state.bytes.set(key, Buffer.from(bytes));
    },
    get: async (key) => state.bytes.get(key),
    delete: async (key) => {
      state.deleted.push(key);
      state.bytes.delete(key);
    },
  };
  const input = {
    projectId,
    config: structuredClone(config),
    contents,
    store,
    objects,
    newId: () => fileId,
  };
  return { state, input };
}

test("one private synthetic upload is attached to the exact project namespace", async () => {
  const { state, input } = fixture();
  const out = await seedDemoUpload(input);
  assert.equal(out.created, true);
  assert.equal(state.records.length, 1);
  const row = state.records[0];
  assert.equal(row.projectId, projectId);
  assert.equal(row.name, filename);
  assert.equal(row.description, description);
  assert.equal(row.uploadedBy, "project-owner");
  assert.equal(
    row.key,
    `teams/demo-team/projects/${projectId}/files/${fileId}`,
  );
  assert.deepEqual(state.bytes.get(row.key), contents);
  assert.equal(row.size, contents.length);
  assert.equal(
    out.downloadUrl,
    `https://valueiq-dev.zhanz.workers.dev/projects/${projectId}/files/${fileId}`,
  );
});

test("rerunning verifies the existing file without duplicate rows or overwrites", async () => {
  const { state, input } = fixture();
  await seedDemoUpload(input);
  assert.equal((await seedDemoUpload(input)).created, false);
  assert.equal(state.records.length, 1);
  assert.equal(state.uploads.length, 1);
});

test("missing projects and failed lookups never write storage", async () => {
  for (const lookup of [
    async () => null,
    async () => {
      throw Error("denied");
    },
  ]) {
    const { state, input } = fixture();
    input.store.findProject = lookup;
    await assert.rejects(seedDemoUpload(input));
    assert.equal(state.uploads.length, 0);
  }
});

test("invalid ids and production/shared targets fail before any lookup", async () => {
  for (const change of [
    (x) => (x.projectId = "bad' OR 1=1"),
    (x) => (x.config.env.development.name = "valueiq-prod"),
    (x) =>
      (x.config.env.development.d1_databases[0].database_id = "production-db"),
    (x) =>
      (x.config.env.development.r2_buckets[0].bucket_name =
        "valueiq-prod-files"),
  ]) {
    const { input } = fixture();
    input.store.findProject = () => assert.fail("Remote access forbidden");
    change(input);
    await assert.rejects(seedDemoUpload(input));
  }
});

test("failed metadata insertion removes only the newly uploaded object", async () => {
  const { state, input } = fixture();
  input.store.insertUpload = async () => {
    throw Error("D1 write denied");
  };
  await assert.rejects(seedDemoUpload(input), /D1 write denied/);
  assert.deepEqual(state.deleted, state.uploads);
  assert.equal(state.deleted.length, 1);
  assert.equal(state.bytes.size, 0);
});

test("a mismatched existing upload is never overwritten or deleted", async () => {
  const { state, input } = fixture();
  await seedDemoUpload(input);
  state.bytes.set(state.uploads[0], Buffer.from("different user content"));
  await assert.rejects(seedDemoUpload(input), /refusing to overwrite/);
  assert.equal(state.deleted.length, 0);
  assert.equal(state.uploads.length, 1);
});

test("the committed CSV labels every record as synthetic", () => {
  const rows = contents.toString("utf8").trim().split(/\r?\n/);
  assert(rows.length > 10);
  assert(rows[0].startsWith("data_status,"));
  assert(rows.slice(1).every((row) => row.startsWith("SYNTHETIC_DEMO_ONLY,")));
});
