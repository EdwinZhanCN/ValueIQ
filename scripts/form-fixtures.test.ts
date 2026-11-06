import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyFormEdit,
  FormValidationError,
  parseFormFile,
  readFormDraft,
  serializeFormFile,
  validateFormFile,
} from "../app/lib/intake-form.ts";
import { context, fixtureCases } from "./form-fixture-cases.ts";

const cases = fixtureCases();
const good = cases.find((item) => item.id === "sample-result")!.form;
const gap = cases.find((item) => item.id === "sample-gap-list")!.form;
await test("sample-result serializer output exactly matches Eli's independent GitHub reference", async () => {
  const reference: unknown = JSON.parse(
    await readFile(
      new URL(
        "../docs/research/samples/sample-result.form.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(JSON.parse(serializeFormFile(good, context)), reference);
  assert.deepEqual(parseFormFile(JSON.stringify(reference), context), good);
});

await test("numeric settings stay in inputs and optional unit metadata is preserved", () => {
  assert.ok(!Object.hasOwn(good, "discount_rate_pct"));
  assert.ok(!Object.hasOwn(good, "adoption_by_year"));
  assert.throws(
    () => serializeFormFile({ ...good, discount_rate_pct: 10 }, context),
    FormValidationError,
  );
  assert.throws(
    () =>
      serializeFormFile({ ...good, adoption_by_year: [50, 80, 90] }, context),
    FormValidationError,
  );
  const draft = structuredClone(good);
  draft.inputs.find((record) => record.id === "staff_affected")!.unit = "count";
  assert.deepEqual(
    parseFormFile(serializeFormFile(draft, context), context),
    draft,
  );
});
for (const fixture of cases) {
  await test(`${fixture.id}: actual form serializer and checked-in fixture agree`, async () => {
    const json = await readFile(
      new URL(
        `../engine/fixtures/forms/${fixture.id}.form.json`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.deepEqual(JSON.parse(json), fixture.form);
    if (fixture.expected === "accepted") {
      assert.deepEqual(parseFormFile(json, context), fixture.form);
      assert.deepEqual(
        JSON.parse(serializeFormFile(fixture.form, context)),
        fixture.form,
      );
    } else {
      assert.throws(
        () => serializeFormFile(fixture.form, context),
        (error: unknown) => {
          assert.ok(error instanceof FormValidationError);
          assert.equal(error.issues.length, 1);
          assert.equal(error.issues[0]?.field, fixture.field);
          assert.equal(error.issues[0]?.code, fixture.code);
          assert.deepEqual(JSON.parse(error.rejectedJson), fixture.form);
          return true;
        },
      );
      assert.throws(() => parseFormFile(json, context), FormValidationError);
      const previous = structuredClone(good);
      const attempt = applyFormEdit(previous, fixture.form, context);
      assert.equal(
        attempt.form,
        previous,
        "Rejected edit must keep the accepted state",
      );
      assert.deepEqual(
        previous,
        good,
        "Validation must not mutate the accepted state",
      );
    }
  });
}

await test("backing flags match the requested six checks without adding evidence", () => {
  const byId = new Map(good.inputs.map((record) => [record.id, record]));
  const flags = (id: string) => {
    const input = byId.get(id)!;
    const b = input.backing ?? {};
    return [
      !!b.source_file_id,
      b.second_source_value !== undefined,
      (b.observations ?? 0) >= 30 || (b.period_months ?? 0) >= 12,
      !!b.source_date,
      input.low !== undefined && input.high !== undefined,
      b.verified === true,
    ];
  };
  assert.deepEqual(flags("hours_saved_per_staff_week"), [
    true,
    false,
    false,
    false,
    false,
    true,
  ]);
  for (const id of [
    "error_count_before",
    "error_count_after",
    "cost_per_error",
  ])
    assert.deepEqual(flags(id), [true, false, true, true, false, false]);
  for (const id of ["aro_before", "aro_after"])
    assert.deepEqual(flags(id), [true, false, false, false, false, true]);
  assert.deepEqual(flags("loss_per_event"), [
    true,
    false,
    true,
    true,
    true,
    true,
  ]);
  const typed = gap.inputs.find(
    (record) => record.id === "hours_saved_per_staff_week",
  )!;
  assert.deepEqual(typed.backing, { source_date: "2026-09-30" });
  assert.equal(typed.tier, "estimate");
  assert.equal(typed.origin, "user");
  assert.ok(!good.inputs.some((record) => record.tier === "measured"));
});

await test("null effects, user-unknown effects and fractional risk are representable", () => {
  for (const update of [
    { value: null },
    { tier: "user_unknown" as const },
    { value: 0.25 },
  ]) {
    const draft = structuredClone(good);
    Object.assign(
      draft.inputs.find((record) => record.id === "aro_after")!,
      update,
    );
    assert.doesNotThrow(() => serializeFormFile(draft, context));
  }
});

await test("untrusted structures, duplicate IDs and inherited object names are rejected", () => {
  for (const candidate of [
    null,
    [],
    {},
    { ...good, inputs: [null] },
    { ...good, goals: ["revenue"] },
    { ...good, measurement_plan: { risk_reduction: { owner: 1 } } },
    { ...good, inputs: [...good.inputs, good.inputs[0]] },
  ])
    assert.ok(validateFormFile(candidate, context).length > 0);
  const draft = structuredClone(good);
  draft.inputs[0]!.id = "__proto__";
  assert.ok(
    validateFormFile(draft, context).some(
      (issue) => issue.code === "UNKNOWN_ID",
    ),
  );
});

await test("foreign file ownership cannot be established by writing a description", () => {
  const draft = structuredClone(good);
  draft.file_descriptions["foreign-project-file"] = "Pretend this belongs here";
  draft.inputs.find(
    (record) => record.id === "hours_saved_per_staff_week",
  )!.backing!.source_file_id = "foreign-project-file";
  assert.ok(
    validateFormFile(draft, context).some(
      (issue) => issue.code === "FOREIGN_FILE",
    ),
  );
});

await test("range endpoints respect domain bounds and ordering even for unknown values", () => {
  const invalid: {
    id: string;
    value?: number | null;
    low: number;
    high: number;
  }[] = [
    { id: "hours_saved_per_staff_week", low: -1, high: 6 },
    { id: "aro_after", value: null, low: 4, high: 1 },
    { id: "aro_after", value: null, low: -1, high: 1 },
    { id: "recapture_pct", low: 40, high: 105 },
  ];
  for (const change of invalid) {
    const draft = structuredClone(good);
    const record = draft.inputs.find((item) => item.id === change.id)!;
    record.low = change.low;
    record.high = change.high;
    if (change.value !== undefined) record.value = change.value;
    assert.throws(
      () => serializeFormFile(draft, context),
      (error: unknown) => {
        assert.ok(error instanceof FormValidationError);
        assert.ok(
          error.issues.some(
            (issue) => issue.code === "RANGE" && issue.field === change.id,
          ),
        );
        return true;
      },
    );
    assert.equal(applyFormEdit(good, draft, context).form, good);
  }
  for (const value of [null, 0.25]) {
    const draft = structuredClone(good);
    Object.assign(
      draft.inputs.find((item) => item.id === "aro_after")!,
      { value, low: 0, high: 0.5 },
    );
    assert.doesNotThrow(() => serializeFormFile(draft, context));
  }
});

await test("bad dates, ranges, enums and non-JSON numbers fail at the form boundary", () => {
  const mutate = (edit: (record: (typeof good.inputs)[number]) => void) => {
    const draft = structuredClone(good);
    edit(draft.inputs.find((record) => record.id === "loss_per_event")!);
    return draft;
  };
  assert.throws(
    () =>
      serializeFormFile(
        mutate((record) => {
          record.backing!.source_date = "2026-02-30";
        }),
        context,
      ),
    FormValidationError,
  );
  assert.throws(
    () =>
      serializeFormFile(
        mutate((record) => {
          record.low = 30000;
        }),
        context,
      ),
    FormValidationError,
  );
  assert.throws(
    () =>
      serializeFormFile(
        mutate((record) => {
          record.value = NaN;
        }),
        context,
      ),
    TypeError,
  );
  assert.throws(
    () =>
      serializeFormFile(
        mutate((record) => {
          record.value = Infinity;
        }),
        context,
      ),
    TypeError,
  );
  const draft = structuredClone(good);
  draft.inputs.find((record) => record.id === "cost_nature")!.value = "revenue";
  assert.throws(() => serializeFormFile(draft, context), FormValidationError);
});

await test("readFormDraft returns a complete saved form unchanged", () => {
  assert.deepEqual(readFormDraft(JSON.parse(JSON.stringify(good))), good);
  assert.deepEqual(readFormDraft(JSON.parse(JSON.stringify(gap))), gap);
});

await test("readFormDraft keeps an incomplete draft without validating it", () => {
  const draft = readFormDraft({
    goals: ["time_savings", "revenue"],
    inputs: [
      { id: "staff_affected", value: 12, tier: "estimate", origin: "user" },
      { id: "not_a_field", value: 1, tier: "estimate", origin: "user" },
      "junk",
    ],
    file_descriptions: { f1: "Timesheets", f2: 3 },
  });
  assert.deepEqual(draft.goals, ["time_savings"]);
  assert.deepEqual(
    draft.inputs.map((record) => record.id),
    ["staff_affected"],
  );
  assert.deepEqual(draft.file_descriptions, { f1: "Timesheets" });
  assert.equal(draft.horizon_years, 0);
  assert.ok(validateFormFile(draft, context).length > 0, "draft is not ready");
});

await test("readFormDraft turns anything that is not a form into an empty draft", () => {
  for (const value of [null, [], "x", 3, { marker: "legacy" }]) {
    const draft = readFormDraft(value);
    assert.deepEqual(draft.goals, []);
    assert.deepEqual(draft.inputs, []);
    assert.equal(draft.other_notes, "");
  }
});
