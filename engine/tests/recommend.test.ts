import { describe, expect, it } from "vitest";
import { recommend } from "../recommend";
import { computeProject } from "../index";
import { goldenResultForm, OPTS } from "./forms";

const cov = (excluded: string[] = []) =>
  ({
    selected: ["time_savings"],
    included: ["time_savings"],
    excluded,
    text: excluded.length ? "1 of 2 goals counted" : "All goals counted.",
  }) as never;
const base = {
  currency: "USD",
  hard: null,
  shortfall: null,
  coverage: cov(),
};

describe("suggested action (engine rules)", () => {
  it("implement: positive even when conservative", () =>
    expect(
      recommend({ ...base, expected: 100, conservative: 10, optimistic: 200 })
        .action,
    ).toBe("implement"));
  it("pilot: positive expected, negative conservative", () =>
    expect(
      recommend({ ...base, expected: 100, conservative: -10, optimistic: 200 })
        .action,
    ).toBe("pilot"));
  it("pilot: positive but goals left out", () =>
    expect(
      recommend({
        ...base,
        expected: 100,
        conservative: 50,
        optimistic: 200,
        coverage: cov(["new_clients"]),
      }).action,
    ).toBe("pilot"));
  it("need more info: negative with goals left out", () =>
    expect(
      recommend({
        ...base,
        expected: -100,
        conservative: -150,
        optimistic: -50,
        coverage: cov(["new_clients"]),
      }).action,
    ).toBe("need_more_info"));
  it("reconsider: negative expected, positive optimistic", () =>
    expect(
      recommend({ ...base, expected: -100, conservative: -150, optimistic: 20 })
        .action,
    ).toBe("reconsider"));
  it("do not implement: negative everywhere, all goals counted", () =>
    expect(
      recommend({ ...base, expected: -100, conservative: -150, optimistic: -5 })
        .action,
    ).toBe("do_not_implement"));
  it("is part of every released result and follows its NPV", () => {
    const r = computeProject(goldenResultForm(), OPTS).result!;
    expect(r.recommendation).toBeDefined();
    const positive = (r.headline.npv.capacity_inclusive as number) > 0;
    expect(["implement", "pilot"].includes(r.recommendation!.action)).toBe(
      positive,
    );
  });
});
