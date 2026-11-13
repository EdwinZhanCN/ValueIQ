import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import fixture from "../../../engine/fixtures/round1/r1-result.json";
import { parseRunOutput } from "../../../shared/output";
import { ReportBuilder } from "../../components/output/report-builder";

describe("fixed report builder", () => {
  it("shows the fixed contents without controls or repeated placeholders", () => {
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

    expect(html).toContain(
      "Your PDF includes all sections and the three standard charts.",
    );
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Report outline");
    expect(html).toContain("Gross → adjusted");
    expect(html).toContain("NPV by discount rate");
    expect(html).toContain("Driver mix");
    expect(html).toContain("Measurement details to confirm");
    expect(html).not.toContain("Not specified");
    expect(html).not.toContain("recapture_pct");
    expect(html).toContain("Freed time used productively (%)");
  });
});
