import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const script = resolve("scripts/check-deploy-target.mjs");
const template = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  await readFile("wrangler.jsonc", "utf8"),
).config;

async function check(environment, mutate = () => {}, extraEnv = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "valueiq-target-"));
  try {
    const source = structuredClone(template);
    source.env.development.d1_databases[0].database_id =
      "11111111-1111-4111-8111-111111111111";
    source.env.production.d1_databases[0].database_id =
      "22222222-2222-4222-8222-222222222222";
    const built = structuredClone(source.env[environment]);
    mutate(source, built);
    await mkdir(join(cwd, "build/server"), { recursive: true });
    await writeFile(join(cwd, "wrangler.jsonc"), JSON.stringify(source));
    await writeFile(
      join(cwd, "build/server/wrangler.json"),
      JSON.stringify(built),
    );
    return spawnSync(process.execPath, [script, environment], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...extraEnv },
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

for (const environment of ["development", "production"]) {
  test(`${environment}: accepts an isolated target`, async () => {
    const result = await check(environment);
    assert.equal(result.status, 0, result.stderr);
  });
}

for (const [name, mutate, message] of [
  ["wrong Worker", (_, built) => (built.name = "valueiq-dev"), /wrong Worker/],
  [
    "unprovisioned database",
    (_, built) =>
      (built.d1_databases[0].database_id =
        "00000000-0000-0000-0000-000000000000"),
    /Provision D1/,
  ],
  [
    "shared database",
    (source, built) =>
      (source.env.development.d1_databases[0].database_id =
        built.d1_databases[0].database_id),
    /different D1 databases/,
  ],
  [
    "cross-Worker Durable Object",
    (_, built) =>
      (built.durable_objects.bindings[0].script_name = "valueiq-dev"),
    /deep-equal/,
  ],
]) {
  test(`rejects ${name}`, async () => {
    const result = await check("production", mutate);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  });
}

test("rejects an environment selector leaking into deployment", async () => {
  const result = await check("production", undefined, {
    CLOUDFLARE_ENV: "production",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /only be set during build/);
});
