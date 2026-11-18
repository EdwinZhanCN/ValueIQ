import { describe, expect, it } from "vitest";
import { quoteSupportsValue } from "../../app/lib/intake-form";

describe("quoteSupportsValue", () => {
  it("accepts the figure itself", () =>
    expect(
      quoteSupportsValue("Average handle time is 12.5 minutes", 12.5),
    ).toBe(true));
  it("accepts a unit change (minutes to hours)", () =>
    expect(quoteSupportsValue("It takes 30 minutes", 0.5)).toBe(true));
  it("strips thousands commas", () =>
    expect(quoteSupportsValue("Spend was $1,200,000", 1200000)).toBe(true));
  it("rejects a passage without the figure", () =>
    expect(quoteSupportsValue("Handle time improved a lot", 12)).toBe(false));
  it("rejects a different number", () =>
    expect(quoteSupportsValue("Handle time is 18 minutes", 12)).toBe(false));
});
