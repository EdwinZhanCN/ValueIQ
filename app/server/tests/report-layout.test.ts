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
  MAX_REPORT_COVER_FIELD_LENGTH,
  REPORT_LAYOUT_VERSION,
  REPORT_PRESETS,
  parseReportLayout,
  storedLayout,
} from "../../../shared/report-layout";

const json = JSON.stringify;

describe("parseReportLayout", () => {
  it("uses the default layout when neither field is sent", () => {
    expect(parseReportLayout()).toEqual({
      ok: true,
      layout: DEFAULT_LAYOUT,
    });
  });

  it.each(["standard", "executive", "financial"] as const)(
    "loads the shared %s preset",
    (preset) => {
      expect(parseReportLayout({ version: "2", preset })).toEqual({
        ok: true,
        layout: REPORT_PRESETS[preset],
      });
    },
  );

  it("keeps custom section order and puts charts in their fixed order", () => {
    const parsed = parseReportLayout({
      version: "2",
      preset: "custom",
      sections: json(["risks", "summary", "charts", "audit"]),
      charts: json(["npv_adoption", "driver_mix"]),
    });
    expect(parsed).toEqual({
      ok: true,
      layout: {
        version: REPORT_LAYOUT_VERSION,
        preset: "custom",
        sections: ["risks", "summary", "charts", "audit"],
        charts: ["driver_mix", "npv_adoption"],
      },
    });
  });

  it("drops the charts when the Charts section is out, without an error", () => {
    expect(
      parseReportLayout({
        sections: json(["summary", "audit"]),
        charts: json(["waterfall"]),
      }),
    ).toEqual({
      ok: true,
      layout: {
        version: 2,
        preset: "custom",
        sections: ["summary", "audit"],
        charts: [],
      },
    });
  });

  it("allows the Charts section with no charts", () => {
    expect(
      parseReportLayout({
        sections: json(["summary", "charts", "audit"]),
        charts: json([]),
      }),
    ).toEqual({
      ok: true,
      layout: {
        version: 2,
        preset: "custom",
        sections: ["summary", "charts", "audit"],
        charts: [],
      },
    });
  });

  it("requires summary and audit in every newly generated report", () => {
    expect(
      parseReportLayout({
        sections: json(["summary", "charts"]),
        charts: json([]),
      }),
    ).toEqual({ ok: false, error: "Audit trail is required in every report." });
    expect(
      parseReportLayout({
        sections: json(["charts", "audit"]),
        charts: json([]),
      }),
    ).toEqual({ ok: false, error: "Summary is required in every report." });
  });

  it("normalizes bounded display-only cover fields", () => {
    expect(
      parseReportLayout({
        version: "2",
        preset: "executive",
        title: "  Funding decision  ",
        preparedFor: "Board",
        preparedBy: "   ",
      }),
    ).toEqual({
      ok: true,
      layout: {
        ...REPORT_PRESETS.executive,
        cover: { title: "Funding decision", preparedFor: "Board" },
      },
    });
    expect(
      parseReportLayout({
        version: "2",
        preset: "standard",
        title: "x".repeat(MAX_REPORT_COVER_FIELD_LENGTH + 1),
      }).ok,
    ).toBe(false);
    expect(
      parseReportLayout({
        version: "2",
        preset: "standard",
        preparedBy: "ValueIQ\nAdmin",
      }).ok,
    ).toBe(false);
  });

  it("refuses unsupported versions, presets and altered preset definitions", () => {
    expect(parseReportLayout({ version: "3", preset: "standard" }).ok).toBe(
      false,
    );
    expect(parseReportLayout({ version: "2", preset: "brief" }).ok).toBe(false);
    expect(
      parseReportLayout({
        version: "2",
        preset: "executive",
        sections: json(DEFAULT_LAYOUT.sections),
        charts: json(DEFAULT_LAYOUT.charts),
      }).ok,
    ).toBe(false);
  });

  it.each([
    [json(["summary", "bogus"]), json([])],
    [json([]), json([])],
    [json(["summary", "summary"]), json([])],
    [json(["summary", "audit"]), json(["pie"])],
    [json(["summary", "audit"]), json(["waterfall", "waterfall"])],
    ["summary", json([])],
    [json({ summary: true }), json([])],
    [json(["summary", 3]), json([])],
  ])("refuses sections %s with charts %s", (sections, charts) => {
    expect(parseReportLayout({ sections, charts }).ok).toBe(false);
  });

  it("reads version 2 and legacy stored layouts without rewriting history", () => {
    expect(storedLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(storedLayout({ sections: ["audit"], charts: [] })).toEqual({
      version: 1,
      sections: ["audit"],
      charts: [],
    });
    expect(storedLayout(REPORT_PRESETS.financial)).toEqual(
      REPORT_PRESETS.financial,
    );
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
        version: 2,
        preset: "custom",
        sections: ["risks", "charts", "summary", "audit"],
        charts: ["npv_haircut", "hard_capacity", "npv_adoption"],
      },
    });
    const t = await text(report.bytes);
    expect(headings(t)).toEqual([
      "01 Risks of doing nothing vs proceeding",
      "02 Charts",
      "03 Executive summary",
      "04 Appendix and audit trail",
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
