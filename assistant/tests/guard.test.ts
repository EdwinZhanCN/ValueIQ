import { describe, expect, it } from "vitest";
import { engineNarrative, type RunOutput } from "../../engine";
import { goldenGapForm, goldenResultForm, NOW } from "../../engine/tests/forms";
import { checkModelText, stripMarkdown } from "../narrative-guard";
import { callTool, createContext } from "../tools";

const outOf = (gap = false): { out: RunOutput; seen: unknown[] } => {
  const c = createContext(gap ? goldenGapForm() : goldenResultForm(), {
    run_id: "g",
    now: NOW,
  });
  callTool("compute_project", {}, c);
  return { out: c.state.last as RunOutput, seen: c.state.seen };
};

describe("K9 narrative guard: real false positives from the live run are accepted", () => {
  const { out, seen } = outOf();

  it("markdown headings, rules and a lone list numeral are not numbers", () => {
    const s = "---\n\n### Value Drivers Breakdown\n\n1.";
    expect(checkModelText(s, out, seen)).toEqual([]);
  });

  it("bold markers, bullet lists and a trailing numeral do not break citations", () => {
    const s =
      "**Time Savings (Capacity Value)*\n*\n * **Gross Value:** $300,000.00 [A1]\n * **After Adoption:** $220,000.00 [A2]\n\n2.";
    expect(checkModelText(s, out, seen)).toEqual([]);
    expect(stripMarkdown(s)).not.toContain("*");
  });

  it("numbers written inside tool-output strings (payback text) and derived forms are allowed", () => {
    const s =
      "The payback is about 11 months (0.96 years) [A4, B3, C3, D1, D2, D3].";
    expect(checkModelText(s, out, seen)).toEqual([]);
  });

  it("tables and percent forms strip cleanly", () => {
    const s =
      "| Driver | Value |\n|---|---|\n| Time savings | $102,850.00 [A4] |";
    expect(checkModelText(s, out, seen)).toEqual([]);
  });
});

describe("K9 narrative guard still rejects every other uncited or invented number", () => {
  const { out, seen } = outOf();
  it.each([
    ["Gross is $300,001.00 [A1].", "invented amount"],
    ["Savings of 55 hours per week are expected.", "uncited and invented"],
    ["The NPV is $127,956.73.", "real number without a ref"],
    ["The payback is about 11 months [Z9].", "unknown ref"],
    ["Gross is $300,000.00 [A1] and 777 hours.", "last number uncited"],
    [
      "1. Gross is $300,000.00 and 42 more.",
      "list numeral stripped, number still checked",
    ],
  ])("%s (%s)", (text) => {
    expect(checkModelText(text, out, seen).length).toBeGreaterThan(0);
  });
});

describe("K9 deterministic engine narrative (the fallback text)", () => {
  it("passes the guard for a result and for a gap list and contains no markdown", () => {
    for (const gap of [false, true]) {
      const { out, seen } = outOf(gap);
      const t = engineNarrative(out);
      expect(t.length).toBeGreaterThan(20);
      expect(checkModelText(t, out, seen)).toEqual([]);
      expect(t).not.toMatch(/[*#|]/);
    }
    const g = engineNarrative(outOf(true).out);
    expect(g).not.toMatch(/npv|roi|payback|net present/i);
  });
});
