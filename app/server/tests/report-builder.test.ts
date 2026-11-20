import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import fixture from "../../../engine/fixtures/round1/r1-result.json";
import { parseRunOutput } from "../../../shared/output";
import { ReportBuilder } from "../../components/output/report-builder";
import { parseChoices } from "../../components/output/report-choices";
import { DEFAULT_LAYOUT } from "../../../shared/report-layout";

describe("report builder", () => {
  it("offers section and chart choices and plain-language contents", () => {
    const output = parseRunOutput(fixture);
    if (output.kind !== "result") throw new Error("Expected result fixture");
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(ReportBuilder, {
          output,
          project: { id: "project-demo", name: "Demo project" },
          reports: [],
          savedReport: null,
        }),
      ),
    );

    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Report outline");
    expect(html).toContain("Gross → adjusted");
    expect(html).toContain("NPV by discount rate");
    expect(html).toContain("Driver mix");
    expect(html).toContain("Details to confirm");
    expect(html).toContain("Decision summary");
    expect(html).toContain("Report details");
    expect(html).toContain("Appendix");
    expect(html).toContain("Confidence 94%, based on 7 documented inputs.");
    expect(html).toContain("About 11 months");
    expect(html).not.toContain("uniform-flow assumption");
    expect(html).not.toContain("Not specified");
    expect(html).not.toContain("recapture_pct");
    expect(html).toContain("Freed time used productively (%)");
    expect(html).toContain('name="version" value="2"');
    expect(html).toContain('name="preset" value="standard"');
    expect(html).toMatch(
      /<input[^>]*disabled[^>]*aria-label="Include Summary"/,
    );
    expect(html).toMatch(
      /<input[^>]*disabled[^>]*aria-label="Include Audit trail"/,
    );
  });

  it("restores required sections from an older browser draft", () => {
    const choices = parseChoices(
      JSON.stringify({
        charts: DEFAULT_LAYOUT.charts,
        sections: [
          { id: "summary", on: false },
          { id: "audit", on: false },
          { id: "risks", on: false },
        ],
      }),
    );

    expect(
      choices.sections.find((section) => section.id === "summary")?.on,
    ).toBe(true);
    expect(choices.sections.find((section) => section.id === "audit")?.on).toBe(
      true,
    );
    expect(choices.sections.find((section) => section.id === "risks")?.on).toBe(
      false,
    );
  });
});
