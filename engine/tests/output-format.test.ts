import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { payback } from "../finance";
import { formatMoney } from "../present";
import { computeProject } from "../project";
import { scanNarrative } from "../narrative";
import type { Result } from "../types";
import { genForm, genStrongForm } from "./gen";
import { OPTS, goldenGapForm, goldenResultForm } from "./forms";

const dec = (x: number) => (String(x).split(".")[1] ?? "").length;
function numbersNamed(
  x: unknown,
  re: RegExp,
  out: number[] = [],
  key = "",
): number[] {
  if (typeof x === "number" && re.test(key)) out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => numbersNamed(v, re, out, key));
  else if (typeof x === "object" && x !== null)
    for (const [k, v] of Object.entries(x)) numbersNamed(v, re, out, k);
  return out;
}

describe("K13 output wording and rounding", () => {
  it("payback text: months under 24 months, years with one decimal otherwise; years stays numeric", () => {
    const q = payback(100, [105, 0], [0, 0]);
    expect(q.text).toBe("about 11 months (uniform-flow assumption)");
    expect(typeof q.years).toBe("number");
    expect(payback(250, [100, 100, 100], [0, 0, 0]).text).toBe(
      "2.5 years (uniform-flow assumption)",
    );
    expect(payback(1000, [1], [0]).text).toBe(
      "No payback within the selected horizon",
    );
    const h = computeProject(goldenResultForm(), OPTS).result?.headline;
    expect(h?.payback.capacity_inclusive.text).toBe(
      "about 11 months (uniform-flow assumption)",
    );
    expect(h?.payback.capacity_inclusive.years).toBeCloseTo(0.9552, 3);
  });

  it("money uses the currency symbol for USD/EUR/GBP and the ISO code after the number otherwise", () => {
    expect(formatMoney(127956.73, "USD")).toBe("$127,956.73");
    expect(formatMoney(-18641.93, "USD")).toBe("-$18,641.93");
    expect(formatMoney(5, "EUR")).toBe("€5.00");
    expect(formatMoney(1234.5, "GBP")).toBe("£1,234.50");
    expect(formatMoney(1234.5, "CAD")).toBe("1,234.50 CAD");
    expect(formatMoney(-1234.5, "CAD")).toBe("-1,234.50 CAD");
  });

  it("the narrative reads in dollars and still passes the integrity scan", () => {
    const r = computeProject(goldenResultForm(), OPTS).result as Result;
    expect(r.narrative.summary).toContain("$127,956.73");
    expect(r.narrative.summary).toContain("-$18,641.93");
    expect(r.narrative.summary).not.toContain("USD");
    expect(scanNarrative(r)).toEqual([]);
    const eur = goldenResultForm();
    eur.currency = "EUR";
    const re = computeProject(eur, OPTS).result as Result;
    expect(re.narrative.summary).toContain("€127,956.73");
    expect(scanNarrative(re)).toEqual([]);
  });

  it("confidence values are rounded to 4 decimals everywhere (gap list items, ledger, drivers)", () => {
    const outs = [
      computeProject(goldenResultForm(), OPTS),
      computeProject(goldenGapForm(), OPTS),
      ...Array.from({ length: 300 }, (_, i) =>
        computeProject(i % 2 ? genStrongForm(i + 1) : genForm(i + 1), OPTS),
      ),
    ];
    for (const o of outs)
      for (const n of numbersNamed(
        o.result ?? o.gap_list,
        /^confidence(_now|_if_added)?$|^project_confidence$/,
      ))
        expect(dec(n)).toBeLessThanOrEqual(4);
  });

  it("the round-1 review fixtures exist and are real-mode outputs", () => {
    const f = (n: string) =>
      JSON.parse(
        readFileSync(
          new URL(`../fixtures/round1/${n}.json`, import.meta.url),
          "utf8",
        ),
      ) as { kind: string; meta: { mode: string } };
    for (const n of [
      "r1-result",
      "r1-gap-list",
      "r1-hard-cash",
      "r1-warning-concentration",
      "r1-customer-borne",
    ])
      expect(f(n).meta.mode).toBe("real");
    expect(f("r1-gap-list").kind).toBe("gap_list");
  });
});
