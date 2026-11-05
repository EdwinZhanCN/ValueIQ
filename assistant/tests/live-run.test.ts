import { describe, expect, it } from "vitest";
import { buildRequest } from "../gemini";
import { main, runLive } from "../live-run";
import { ModelConfigError, resolveThinkingBudget } from "../models";
import { TOOLS } from "../tools";

describe("K16 live-run --dry (scripted fake model, no key, no network)", () => {
  it("runs both sample forms through the full loop and every check passes", async () => {
    const lines: string[] = [];
    const r = await runLive({ dry: true, env: {}, out: (l) => lines.push(l) });
    expect(r.ok).toBe(true);
    expect(r.scenarios.map((s) => s.name)).toEqual([
      "sample-result",
      "sample-gap-list",
    ]);
    const text = lines.join("\n");
    for (const f of [
      "npv.hard",
      "npv.capacity_inclusive",
      "roi.pv.capacity_inclusive",
      "benefits_pv",
      "costs_pv",
    ])
      expect(text).toContain(`PASS ${f}`);
    expect(text).toContain("PASS run ends with gap_list");
    expect(text).toContain("PASS narrative has no headline number");
    expect(text).toContain(
      "requested=gemini-3.6-flash modelVersion=gemini-3.6-flash",
    );
    expect(text).toMatch(/thinking=\d+/);
    expect(text).not.toContain("FAIL");
    expect(r.cost_usd).toBeGreaterThan(0);
  });

  it("when the guard rejects the narrative it prints sentence and reason, retries once with feedback, then passes", async () => {
    const lines: string[] = [];
    const r = await runLive({
      dry: true,
      dryBadFirst: true,
      env: {},
      out: (l) => lines.push(l),
    });
    const text = lines.join("\n");
    expect(text).toContain("GUARD REJECTED (attempt 1)");
    expect(text).toContain("The project returns an NPV of 8,181.82 dollars.");
    expect(text).toContain("is not in any tool output");
    expect(r.ok).toBe(true);
  });

  it("exits cleanly with a message when the key is absent", async () => {
    const lines: string[] = [];
    const code = await main([], {}, (l) => lines.push(l));
    expect(code).toBe(0);
    expect(lines.join(" ")).toContain("GEMINI_API_KEY is not set");
  });

  it("logs hold ids and hashes only, no file contents or key", async () => {
    const lines: string[] = [];
    await runLive({ dry: true, env: {}, out: (l) => lines.push(l) });
    const text = lines.join("\n");
    expect(text).not.toContain("dry-run-key");
    expect(text).not.toMatch(/AIza/);
    expect(text).not.toContain("test file"); // file description text
  });
});

describe("K16 thinking budget option for the calculation model", () => {
  it("is unset by default, read from GEMINI_THINKING_BUDGET_CALC, validated, and sent as thinkingConfig", () => {
    expect(resolveThinkingBudget({})).toBeUndefined();
    expect(resolveThinkingBudget({ GEMINI_THINKING_BUDGET_CALC: "0" })).toBe(0);
    expect(resolveThinkingBudget({ GEMINI_THINKING_BUDGET_CALC: "-1" })).toBe(
      -1,
    );
    expect(resolveThinkingBudget({ GEMINI_THINKING_BUDGET_CALC: "512" })).toBe(
      512,
    );
    expect(() =>
      resolveThinkingBudget({ GEMINI_THINKING_BUDGET_CALC: "lots" }),
    ).toThrow(ModelConfigError);
    expect(() =>
      resolveThinkingBudget({ GEMINI_THINKING_BUDGET_CALC: "-5" }),
    ).toThrow(ModelConfigError);
    const none = buildRequest("s", [], TOOLS);
    expect("generationConfig" in none).toBe(false);
    const with0 = buildRequest("s", [], TOOLS, 0) as {
      generationConfig?: { thinkingConfig: { thinkingBudget: number } };
    };
    expect(with0.generationConfig?.thinkingConfig.thinkingBudget).toBe(0);
  });
});
