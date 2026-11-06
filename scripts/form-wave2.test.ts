import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  parseFormFile,
  serializeFormFile,
  validateFormFile,
} from "../app/lib/intake-form.ts";
import { context } from "./form-fixture-cases.ts";
import { wave2Cases } from "./form-wave2-cases.ts";

const cases = wave2Cases();
const references = new URL(
  "../docs/research/samples/wave2/forms/",
  import.meta.url,
);
const get = (caseId: string, inputId: string) => {
  const input = cases
    .find((item) => item.id === caseId)
    ?.form.inputs.find((item) => item.id === inputId);
  assert.ok(input, `${caseId}/${inputId}`);
  return input;
};

await test("the second wave contains exactly all 19 independent reference cases", async () => {
  const names = (await readdir(references))
    .filter((name) => name.endsWith(".form.json"))
    .sort();
  assert.equal(cases.length, 19);
  assert.equal(new Set(cases.map((item) => item.id)).size, 19);
  assert.deepEqual(cases.map((item) => `${item.id}.form.json`).sort(), names);
});
for (const fixture of cases) {
  await test(`${fixture.id}: real serializer output equals Eli's entire reference form`, async () => {
    const reference: unknown = JSON.parse(
      await readFile(new URL(`${fixture.id}.form.json`, references), "utf8"),
    );
    assert.deepEqual(validateFormFile(fixture.form, context), []);
    const produced = serializeFormFile(fixture.form, context);
    assert.deepEqual(JSON.parse(produced), reference);
    assert.deepEqual(parseFormFile(produced, context), fixture.form);
    const committed: unknown = JSON.parse(
      await readFile(
        new URL(
          `../engine/fixtures/forms/${fixture.id}.form.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(committed, reference);
  });
}
await test("decision-speed submissions preserve values, backing and the example decision", () => {
  for (const id of ["driver-decision-speed", "combined-all-four"]) {
    assert.equal(get(id, "decisions_per_year").value, 50);
    assert.equal(get(id, "days_to_decide_before").value, 10);
    assert.equal(get(id, "days_to_decide_after").value, 6);
    assert.equal(get(id, "cost_of_delay_per_day").value, 400);
    assert.equal(get(id, "cost_of_delay_basis").value, "revenue_deferred");
    assert.equal(
      get(id, "example_decision").value,
      "Q2 vendor approval took 10 days",
    );
    for (const input of [
      "days_to_decide_before",
      "days_to_decide_after",
      "cost_of_delay_per_day",
    ])
      assert.deepEqual(get(id, input).backing, {
        source_file_id: "f1",
        observations: 100,
        source_date: "2026-09-30",
        verified: true,
      });
  }
});
await test("hard cash, customer-borne costs, zero costs and delay are not normalized away", () => {
  assert.equal(get("class-hard-cash", "realized_as_cash").value, 20000);
  assert.ok(
    !cases
      .find((item) => item.id === "class-no-cash")!
      .form.inputs.some((input) => input.id === "realized_as_cash"),
  );
  assert.equal(get("class-customer-borne", "cost_bearer").value, "customer");
  for (const id of [
    "cost_one_time_vendor_license",
    "cost_training_change",
    "cost_annual_run",
  ])
    assert.equal(get("edge-zero-cost", id).value, 0);
  assert.equal(get("edge-delay-6", "delay_months").value, 6);
});
await test("unknown value and unknown tier remain distinct exact submissions", () => {
  const unknownValue = get("unknown-null-effect", "hours_saved_per_staff_week");
  assert.equal(unknownValue.value, null);
  assert.equal(unknownValue.tier, "documented");
  assert.ok(unknownValue.backing?.verified);
  const unknownTier = get(
    "unknown-user-unknown-tier",
    "hours_saved_per_staff_week",
  );
  assert.equal(unknownTier.value, 5);
  assert.equal(unknownTier.tier, "user_unknown");
  assert.equal(unknownTier.backing, undefined);
});
await test("gate cases preserve weak evidence without attempting a form-layer release decision", () => {
  assert.equal(
    get("gate-project-below-floor", "hours_saved_per_staff_week").tier,
    "benchmark",
  );
  assert.equal(
    get("gate-estimate-effect", "hours_saved_per_staff_week").tier,
    "estimate",
  );
  for (const id of [
    "error_count_before",
    "error_count_after",
    "cost_per_error",
  ]) {
    assert.equal(get("gate-one-driver-dropped", id).tier, "estimate");
    assert.equal(get("gate-one-driver-dropped", id).backing, undefined);
  }
  for (const fixture of cases.filter((item) => item.id.startsWith("gate-")))
    assert.deepEqual(validateFormFile(fixture.form, context), []);
});
