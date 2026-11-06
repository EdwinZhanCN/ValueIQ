// The forms scripts/e2e-run.mjs saves are valid and give the outputs the script expects.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeProject, validateInputs, type FormFile } from "../index";
import { OPTS } from "./forms";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as unknown;
const sampleForm = read(
  "docs/research/samples/sample-result.form.json",
) as FormFile;
const gapForm = read("scripts/e2e-gap.form.json") as FormFile;
const sample = read("docs/research/samples/sample-result.json") as {
  result: { headline: { npv: { hard: number } } };
};

describe("e2e forms", () => {
  it("the sample result form validates and reproduces the sample headline", () => {
    expect(validateInputs(sampleForm).ok).toBe(true);
    const out = computeProject(sampleForm, OPTS);
    expect(out.kind).toBe("result");
    expect(out.result?.headline.npv.hard).toBeCloseTo(
      sample.result.headline.npv.hard,
      1,
    );
  });
  it("the gap form validates and gives a gap list at confidence 0.615 with no headline", () => {
    expect(validateInputs(gapForm).ok).toBe(true);
    const out = computeProject(gapForm, OPTS);
    expect(out.kind).toBe("gap_list");
    expect(out.gap_list?.project_confidence).toBeCloseTo(0.615, 3);
    expect(out.result).toBeUndefined();
  });
});
