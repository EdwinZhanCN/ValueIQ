import { describe, expect, it } from "vitest";
import { reportFilename } from "../../lib/report-filename";

describe("reportFilename", () => {
  it("uses a normalized project name", () => {
    expect(reportFilename("Golden Gate")).toBe("valueiq-golden-gate.pdf");
    expect(reportFilename(" Q4 / Résumé: ROI? ")).toBe(
      "valueiq-q4-résumé-roi.pdf",
    );
  });

  it("uses a readable fallback when the name has no letters or numbers", () => {
    expect(reportFilename("💡 / —")).toBe("valueiq-project.pdf");
  });
});
