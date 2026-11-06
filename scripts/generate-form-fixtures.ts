import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
import {
  FormValidationError,
  parseFormFile,
  serializeFormFile,
} from "../app/lib/intake-form.ts";
import { context, fixtureCases, referenceDate } from "./form-fixture-cases.ts";

const directory = new URL("../engine/fixtures/forms/", import.meta.url);
const check = process.argv.includes("--check");
await mkdir(directory, { recursive: true });
const manifest: {
  id: string;
  expected: string;
  issues: { code: string; field: string; message: string }[];
}[] = [];
async function output(name: string, text: string) {
  const formatted = await format(text, { parser: "json" });
  if (check)
    assert.equal(
      await readFile(new URL(name, directory), "utf8"),
      formatted,
      `${name} is stale; regenerate fixtures.`,
    );
  else await writeFile(new URL(name, directory), formatted);
}
for (const fixture of fixtureCases()) {
  let json: string;
  let issues: { code: string; field: string; message: string }[] = [];
  try {
    json = serializeFormFile(fixture.form, context);
    assert.equal(
      fixture.expected,
      "accepted",
      `${fixture.id} should be rejected`,
    );
    assert.deepEqual(parseFormFile(json, context), fixture.form);
  } catch (error) {
    if (!(error instanceof FormValidationError)) throw error;
    assert.equal(
      fixture.expected,
      "rejected",
      `${fixture.id} unexpectedly rejected: ${error.message}`,
    );
    assert.equal(
      error.issues.length,
      1,
      `${fixture.id} must have exactly one defect`,
    );
    assert.equal(error.issues[0]?.field, fixture.field);
    assert.equal(error.issues[0]?.code, fixture.code);
    // Keep the serializer's exact rejected candidate for the engine's own
    // rejection test. Never cast it to a validated FormFile or save it as one.
    json = error.rejectedJson;
    issues = error.issues;
  }
  await output(`${fixture.id}.form.json`, json);
  manifest.push({ id: fixture.id, expected: fixture.expected, issues });
}
await output(
  "validation.json",
  `${JSON.stringify({ reference_date: referenceDate, context, cases: manifest }, null, 2)}\n`,
);
console.log(
  `${check ? "Checked" : "Generated"} ${manifest.length} forms: 2 accepted, 12 rejected (11 requested cases plus horizon 21).`,
);
