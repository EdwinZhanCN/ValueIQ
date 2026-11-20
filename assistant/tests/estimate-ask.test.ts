import { describe, expect, it } from "vitest";
import {
  estimateMessage,
  parseAsk,
  settle,
} from "../../app/components/clarify/estimate-ask";
import { delegatesEstimates } from "../tools";

describe("per-row estimate requests", () => {
  it("the row message passes the server's estimate-for-me rule", () =>
    expect(delegatesEstimates(estimateMessage("Close rate (%)"))).toBe(true));
  it("accepts the plain-string detail and the object detail", () => {
    expect(parseAsk("Estimate all")).toEqual({ text: "Estimate all", ids: [] });
    expect(parseAsk({ text: "x", ids: ["a", 3] })).toEqual({
      text: "x",
      ids: ["a"],
    });
    expect(parseAsk(42)).toBeNull();
  });
  it("splits pending rows into resolved and failed by what the assistant wrote", () => {
    expect(
      settle(new Set(["a", "b"]), { applied: ["a", "z"], ok: true }),
    ).toEqual({ resolved: ["a"], failed: ["b"] });
    expect(settle(new Set(["a"]), { applied: [], ok: false })).toEqual({
      resolved: [],
      failed: ["a"],
    });
  });
});
