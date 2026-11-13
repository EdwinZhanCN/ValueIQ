import { describe, expect, it } from "vitest";
import {
  confidenceSummary,
  inputLabel,
  isNotCountedInHard,
  isSpecified,
  paybackHeadline,
  plainLanguage,
} from "../../lib/output-presentation";

describe("output presentation", () => {
  it("uses plain evidence language without exposing raw input keys", () => {
    expect(
      plainLanguage("Haircut uses the weakest link and must clear the floor."),
    ).toBe(
      "Evidence discount uses the least-supported input and must clear the minimum confidence we require.",
    );
    expect(inputLabel("recapture_pct")).toBe(
      "Freed time used productively (%)",
    );
    expect(plainLanguage("After evidence haircut and recapture")).toBe(
      "After evidence discount and productive use of freed time",
    );
  });

  it("makes the human payback estimate and confidence the headline", () => {
    expect(paybackHeadline("about 11 months (uniform-flow assumption)")).toBe(
      "About 11 months",
    );
    expect(
      confidenceSummary(0.935, {
        measured: 0,
        documented: 7,
        benchmark: 0,
      }),
    ).toBe("Confidence 94%, based on 7 documented inputs.");
  });

  it("collapses the engine's missing measurement placeholder", () => {
    expect(isSpecified("Not specified")).toBe(false);
    expect(isSpecified("Not specified: define a measure")).toBe(false);
    expect(isSpecified("Ops lead")).toBe(true);
  });

  it("keeps capacity and avoided loss out of the hard-financial view", () => {
    expect(isNotCountedInHard("capacity_value")).toBe(true);
    expect(isNotCountedInHard("avoided_loss")).toBe(true);
    expect(isNotCountedInHard("hard_savings")).toBe(false);
  });
});
