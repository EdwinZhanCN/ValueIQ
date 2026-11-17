// The report layout: the parser's whitelist rules, and the PDF template
// printing exactly the chosen sections (numbered in order) and charts.
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { renderEngineReport } from "../../../docs/research/output/pdf-preview/engine-report.mjs";
import type { ResultOutput } from "../../../shared/output";
import {
  DEFAULT_LAYOUT,
  parseReportLayout,
  storedLayout,
} from "../../../shared/report-layout";

const json = JSON.stringify;

describe("parseReportLayout", () => {
  it("uses the default layout when neither field is sent", () => {
    expect(parseReportLayout(null, null)).toEqual({
      ok: true,
      layout: DEFAULT_LAYOUT,
    });
  });

  it("keeps the section order and puts charts in their fixed order", () => {
    const parsed = parseReportLayout(
      json(["risks", "summary", "charts"]),
      json(["npv_adoption", "driver_mix"]),
    );
    expect(parsed).toEqual({
      ok: true,
      layout: {
        sections: ["risks", "summary", "charts"],
        charts: ["driver_mix", "npv_adoption"],
      },
    });
  });

  it("drops the charts when the Charts section is out, without an error", () => {
    expect(parseReportLayout(json(["summary"]), json(["waterfall"]))).toEqual({
      ok: true,
      layout: { sections: ["summary"], charts: [] },
    });
  });

  it("allows the Charts section with no charts", () => {
    expect(parseReportLayout(json(["charts"]), json([]))).toEqual({
      ok: true,
      layout: { sections: ["charts"], charts: [] },
    });
  });

  it.each([
    [json(["summary", "bogus"]), json([])],
    [json([]), json([])],
    [json(["summary", "summary"]), json([])],
    [json(["summary"]), json(["pie"])],
    [json(["summary"]), json(["waterfall", "waterfall"])],
    ["summary", json([])],
    [json({ summary: true }), json([])],
    [json(["summary", 3]), json([])],
  ])("refuses sections %s with charts %s", (sections, charts) => {
    expect(parseReportLayout(sections, charts).ok).toBe(false);
  });

  it("reads a stored layout, and the default for none", () => {
    expect(storedLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(storedLayout({ sections: ["audit"], charts: [] })).toEqual({
      sections: ["audit"],
      charts: [],
    });
    expect(storedLayout({ sections: ["nope"], charts: [] })).toEqual(
      DEFAULT_LAYOUT,
    );
  });
});

describe("renderEngineReport with a layout", () => {
  const data = JSON.parse(
    readFileSync("docs/research/samples/sample-result.json", "utf8"),
  ) as ResultOutput;
  const fonts = {
    regular: readFileSync("app/assets/report-regular.ttf"),
    bold: readFileSync("app/assets/report-bold.ttf"),
  };
  const text = async (bytes: Uint8Array) =>
    (await extractText(await getDocumentProxy(bytes), { mergePages: true }))
      .text;
  const headings = (t: string) =>
    [...t.matchAll(/^(\d\d) ([A-Z][a-z]+(?: [a-z]+)*)$/gm)].map(
      (m) => `${m[1]} ${m[2]}`,
    );

  it("prints the default sections and the three standard charts", async () => {
    const report = await renderEngineReport({
      PDFDocument,
      rgb,
      fontkit,
      fonts,
      data,
    });
    expect(report.sections).toHaveLength(9);
    expect(report.charts).toEqual(["waterfall", "npv_discount", "driver_mix"]);
    expect(headings(await text(report.bytes))[0]).toBe("01 Executive summary");
  });

  it("prints only the chosen sections, numbered in their order", async () => {
    const report = await renderEngineReport({
      PDFDocument,
      rgb,
      fontkit,
      fonts,
      data,
      layout: {
        sections: ["risks", "charts", "summary"],
        charts: ["npv_haircut", "hard_capacity", "npv_adoption"],
      },
    });
    const t = await text(report.bytes);
    expect(headings(t)).toEqual([
      "01 Risks of doing nothing vs proceeding",
      "02 Charts",
      "03 Executive summary",
    ]);
    expect(report.charts).toEqual([
      "npv_adoption",
      "npv_haircut",
      "hard_capacity",
    ]);
    expect(t).toContain("NPV by evidence discount");
    expect(t).not.toContain("Measurement plan");
    expect(t).toContain("$127,956.73");
  });
});
