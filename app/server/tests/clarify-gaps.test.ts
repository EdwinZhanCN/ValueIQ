import { describe, expect, it } from "vitest";
import { clarifyGaps } from "../clarify-gaps.server";
import { CLAIMS_DONE } from "../../../assistant/intake";
import type { FormFile } from "../../../shared/form";
import { goldenResultForm } from "../../../engine/tests/forms";

describe("clarifyGaps mirrors the Inputs panel", () => {
  it("is empty for a complete form", () => {
    const form = goldenResultForm() as unknown as FormFile;
    expect(clarifyGaps(form)).not.toContain("staff_affected");
  });
  it("lists an input with no value, and one marked not sure", () => {
    const form = goldenResultForm() as unknown as FormFile;
    form.inputs = form.inputs.map((i) =>
      i.id === "staff_affected"
        ? { ...i, value: null, tier: "user_unknown" as const }
        : i,
    );
    form.inputs = form.inputs.filter((i) => i.id !== "weeks_per_year");
    const gaps = clarifyGaps(form);
    expect(gaps).toContain("staff_affected");
    expect(gaps).toContain("weeks_per_year");
  });
  it("lists the New clients inputs when that goal is selected and they are empty", () => {
    const form = goldenResultForm() as unknown as FormFile;
    form.goals = ["time_savings", "new_clients"];
    expect(clarifyGaps(form)).toEqual(
      expect.arrayContaining([
        "leads_reached_per_year",
        "response_rate_pct",
        "close_rate_pct",
        "gross_profit_per_customer",
      ]),
    );
  });
});

describe("a reply may not claim everything is done", () => {
  it.each([
    "All inputs are now complete and validated successfully.",
    "Every field is filled in.",
    "Nothing is missing.",
  ])("flags: %s", (text) => expect(CLAIMS_DONE.test(text)).toBe(true));
  it("does not flag an ordinary reply", () =>
    expect(CLAIMS_DONE.test("I filled in the response rate at 5%.")).toBe(
      false,
    ));
});
