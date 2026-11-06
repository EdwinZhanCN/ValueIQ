import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseRunOutput } from "../shared/output.ts";
const result = JSON.parse(
  await readFile(
    new URL("../docs/research/samples/sample-result.json", import.meta.url),
    "utf8",
  ),
);
const gap = JSON.parse(
  await readFile(
    new URL("../docs/research/samples/sample-gap-list.json", import.meta.url),
    "utf8",
  ),
);
test("published fixtures preserve every value across validation", () => {
  assert.deepEqual(parseRunOutput(result), result);
  assert.deepEqual(parseRunOutput(gap), gap);
});
test("unsupported versions, dual payloads and nonfinite numbers cannot become a result", () => {
  for (const mutate of [
    (x) => (x.meta.contract_version = "2"),
    (x) => (x.gap_list = gap.gap_list),
    (x) => (x.result.headline.npv.hard = Infinity),
    (x) => (x.result.costs.lines[0].basis = "invented"),
  ]) {
    const value = structuredClone(result);
    mutate(value);
    assert.throws(() => parseRunOutput(value), /ENGINE_INTEGRITY/);
  }
});
test("a failed release declaration cannot expose a headline", () => {
  const value = structuredClone(result);
  value.result.confidence.project.confidence = 0.5;
  assert.throws(() => parseRunOutput(value), /ENGINE_INTEGRITY/);
});
test("zero stays zero; undefined metrics need an explicit reason", () => {
  const value = structuredClone(result);
  value.result.headline.roi.pv.hard = 0;
  assert.equal(parseRunOutput(value).result.headline.roi.pv.hard, 0);
  value.result.headline.roi.pv.hard = null;
  assert.throws(() => parseRunOutput(value));
  value.result.headline.null_reasons["roi.pv.hard"] = "Zero cost";
  assert.equal(parseRunOutput(value).result.headline.roi.pv.hard, null);
});
test("yearly steps and gap ordering must match the declared contract", () => {
  const value = structuredClone(result);
  value.result.drivers[0].steps[0].by_year = [];
  assert.throws(() => parseRunOutput(value));
  const gaps = structuredClone(gap);
  gaps.gap_list.items[1].rank = 1;
  assert.throws(() => parseRunOutput(gaps));
});
test("additive keys are ignored without altering the known result", () => {
  assert.deepEqual(
    parseRunOutput({ ...result, new_engine_field: "ignored" }),
    result,
  );
});
