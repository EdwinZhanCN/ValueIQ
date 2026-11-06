import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeProject } from "../project";
import { goldenGapForm, goldenResultForm } from "./forms";

const dir = new URL("../fixtures/", import.meta.url);
const resultPath = new URL("sample-result.json", dir);
const gapPath = new URL("sample-gap-list.json", dir);

/** Compare every numeric leaf of the fixture with the engine output (fixture values are rounded). */
function compare(
  actual: unknown,
  expected: unknown,
  path: string,
  out: string[],
  skip: (p: string) => boolean,
): void {
  if (skip(path)) return;
  if (typeof expected === "number") {
    if (typeof actual !== "number") {
      out.push(
        `${path}: expected number ${expected}, got ${JSON.stringify(actual)}`,
      );
      return;
    }
    // fixture numbers are rounded to 2 decimals (4 for fractions)
    const tol =
      Math.abs(expected) < 1.5
        ? 5.1e-5
        : Math.max(1e-6 * Math.abs(expected), 5.1e-3);
    if (Math.abs(actual - expected) > tol)
      out.push(`${path}: expected ${expected}, got ${actual}`);
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      out.push(`${path}: expected array`);
      return;
    }
    expected.forEach((e, i) =>
      compare(actual[i], e, `${path}[${i}]`, out, skip),
    );
  } else if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") {
      out.push(`${path}: expected object`);
      return;
    }
    for (const [k, v] of Object.entries(expected as Record<string, unknown>))
      compare(
        (actual as Record<string, unknown>)[k],
        v,
        `${path}.${k}`,
        out,
        skip,
      );
  }
}

describe("Golden fixtures (computed independently by make_samples.py)", () => {
  const optsFor = (id: string) => ({
    run_id: id,
    generated_at: "2026-11-05T12:00:00Z",
    mode: "stub" as const,
  });

  (existsSync(resultPath) ? it : it.skip)(
    "sample-result.json is reproduced from the matching form",
    () => {
      const expected = JSON.parse(readFileSync(resultPath, "utf8")) as unknown;
      const actual = computeProject(
        goldenResultForm(),
        optsFor("run_sample_released"),
      );
      const diffs: string[] = [];
      compare(actual, expected, "$", diffs, () => false);
      expect(diffs).toEqual([]);
    },
  );

  (existsSync(gapPath) ? it : it.skip)(
    "sample-gap-list.json is reproduced from the matching form",
    () => {
      const expected = JSON.parse(readFileSync(gapPath, "utf8")) as unknown;
      const actual = computeProject(goldenGapForm(), optsFor("run_sample_gap"));
      const diffs: string[] = [];
      // The fixture meta.tier_counts (1 documented, 2 estimate) cannot come from the single
      // input the fixture describes, so it is not compared (see DECISIONS.md).
      compare(
        actual,
        expected,
        "$",
        diffs,
        (p) =>
          p === "$.meta.tier_counts" || p.startsWith("$.meta.tier_counts."),
      );
      expect(diffs).toEqual([]);
    },
  );
});
