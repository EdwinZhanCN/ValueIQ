import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Reference files have type-only dependencies. Transpile them in memory so
// contract tests require no extra runtime dependency or emitted build files.
async function reference(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const { INPUT_CATALOG, questionsForGoals, COST_UPLIFT_CANDIDATES } =
  await reference("../shared/input-catalog.ts");
const { GOALS } = await reference("../shared/types.ts");
const { exampleForm } = await reference(
  "../docs/research/examples/input-form-v1.ts",
);
const byId = new Map(INPUT_CATALOG.map((field) => [field.id, field]));

test("exported JSON stays identical to the typechecked example", async () => {
  const jsonExample = JSON.parse(
    await readFile(
      new URL("../docs/research/examples/input-form-v1.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(jsonExample, exampleForm);
});

test("every goal combination asks common questions once and excludes unrelated questions", () => {
  for (let mask = 1; mask < 1 << GOALS.length; mask++) {
    const selected = GOALS.filter((_, index) => mask & (1 << index));
    const questions = questionsForGoals([...selected, selected[0]]);
    assert.equal(
      questions.length,
      new Set(questions.map((field) => field.id)).size,
    );
    assert.ok(questions.some((field) => field.id === "cost_annual_run"));
    for (const field of INPUT_CATALOG) {
      assert.equal(
        questions.includes(field),
        field.scope === "common" || selected.includes(field.scope),
      );
    }
  }
});

test("catalog defaults are sourced proposals and never fabricated business facts", () => {
  assert.equal(byId.size, INPUT_CATALOG.length);
  for (const field of INPUT_CATALOG) {
    assert.ok(field.question && field.info && field.respondent);
    if (field.default)
      assert.ok(
        field.default.source && field.default.tier && field.default.storage,
      );
  }
  for (const id of [
    "cost_of_delay_per_day",
    "staff_affected",
    "hours_saved_per_staff_week",
    "cost_annual_run",
    "loaded_hourly_cost",
  ])
    assert.equal(byId.get(id).default, undefined);
  for (const value of Object.values(COST_UPLIFT_CANDIDATES))
    assert.equal(value.tier, "assumption");
  assert.equal(byId.get("aro_after").type, "number");
  assert.equal(byId.get("staff_affected").type, "integer");
});

test("example uses catalog units, periods, types, bounds and selected goal fields", () => {
  assert.equal(exampleForm.contract_version, 1);
  assert.equal(exampleForm.adoption_by_year.length, exampleForm.horizon_years);
  assert.equal(
    new Set(exampleForm.inputs.map((input) => input.id)).size,
    exampleForm.inputs.length,
  );
  for (const input of exampleForm.inputs) {
    const field = byId.get(input.id);
    assert.ok(field, input.id);
    assert.ok(
      field.scope === "common" || exampleForm.goals.includes(field.scope),
      input.id,
    );
    assert.equal(input.unit, field.unit, input.id);
    assert.equal(input.period, field.period, input.id);
    assert.ok(input.source && input.tier && input.origin, input.id);
    if (input.value === null) {
      assert.ok(input.unknown_reason);
      continue;
    }
    if (field.type === "number" || field.type === "integer") {
      assert.equal(typeof input.value, "number", input.id);
      assert.ok(Number.isFinite(input.value), input.id);
      if (field.type === "integer")
        assert.ok(Number.isInteger(input.value), input.id);
      if (field.min !== undefined)
        assert.ok(input.value >= field.min, input.id);
      if (field.max !== undefined)
        assert.ok(input.value <= field.max, input.id);
      if (field.exclusiveMin !== undefined)
        assert.ok(input.value > field.exclusiveMin, input.id);
      if (input.low !== undefined) assert.ok(input.low <= input.value);
      if (input.high !== undefined) assert.ok(input.high >= input.value);
    }
    if (field.options) assert.ok(field.options.includes(input.value), input.id);
    if (field.role === "cost")
      assert.ok(["quoted", "estimated", "assumed"].includes(input.basis));
    if (field.role !== "effect") assert.equal(input.backing, undefined);
  }
});

test("groups project descriptions onto unique persistent file references", () => {
  const ids = exampleForm.files.map((file) => file.id);
  assert.equal(new Set(ids).size, ids.length);
  const grouped = exampleForm.file_groups.flatMap((group) => {
    assert.ok(group.description.trim() && group.file_ids.length);
    for (const id of group.file_ids) {
      assert.ok(ids.includes(id));
      assert.equal(exampleForm.file_descriptions[id], group.description);
    }
    return group.file_ids;
  });
  assert.deepEqual([...grouped].sort(), [...ids].sort());
  assert.deepEqual(
    Object.keys(exampleForm.file_descriptions).sort(),
    [...ids].sort(),
  );
  for (const input of exampleForm.inputs) {
    if (input.backing?.source_file_id)
      assert.ok(ids.includes(input.backing.source_file_id));
    if (input.tier === "measured")
      assert.ok(
        input.backing?.source_file_id &&
          input.backing.quote?.trim() &&
          input.backing.quote_confirmed,
      );
  }
});

test("example demonstrates direct-hours path, fractional risk and explicit unknowns", () => {
  const inputs = new Map(exampleForm.inputs.map((input) => [input.id, input]));
  assert.equal(inputs.get("hours_saved_per_staff_week").value, 5);
  assert.equal(inputs.has("minutes_per_task_before"), false);
  assert.equal(inputs.get("aro_after").value, 0.25);
  assert.equal(inputs.get("aro_after").tier, "estimate");
  assert.equal(inputs.get("realized_as_cash").value, null);
  assert.equal(inputs.get("cost_one_time_internal_labor").value, null);
  assert.ok(inputs.get("aro_after").value <= inputs.get("aro_before").value);
  assert.deepEqual(
    Object.keys(exampleForm.measurement_plan).sort(),
    [...exampleForm.goals].sort(),
  );
});
