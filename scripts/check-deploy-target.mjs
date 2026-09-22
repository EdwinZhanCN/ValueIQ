import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

assert(
  !process.env.CLOUDFLARE_ENV,
  "CLOUDFLARE_ENV must only be set during build, not deployment",
);
const environment = process.argv[2];
const worker = { development: "valueiq-dev", production: "valueiq-prod" }[
  environment
];
assert(worker, "Expected development or production");
const config = JSON.parse(await readFile("build/server/wrangler.json", "utf8"));
assert.equal(config.name, worker, "Build targets the wrong Worker");
assert.equal(config.d1_databases.length, 1, "Expected one D1 binding");
const database = config.d1_databases[0];
assert.equal(database.binding, "DB");
assert.equal(
  database.database_name,
  worker,
  "Build targets the wrong database",
);
assert.match(
  database.database_id ?? "",
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
  "Missing or invalid D1 database ID; see docs/deployment.md",
);
assert.notEqual(
  database.database_id,
  "00000000-0000-0000-0000-000000000000",
  "Provision D1 and replace the placeholder in wrangler.jsonc; see docs/deployment.md",
);
const source = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  await readFile("wrangler.jsonc", "utf8"),
);
assert(!source.error, "Invalid wrangler.jsonc");
assert.equal(
  database.database_id,
  source.config.env[environment].d1_databases[0].database_id,
  "Build does not match the configured database",
);
const other = environment === "production" ? "development" : "production";
assert.notEqual(
  database.database_id,
  source.config.env[other].d1_databases[0].database_id,
  "Development and production must use different D1 databases",
);
assert.deepEqual(config.durable_objects.bindings, [
  { name: "ValueIQAgent", class_name: "ValueIQAgent" },
]);
console.log(`Deployment target verified: ${worker}`);
