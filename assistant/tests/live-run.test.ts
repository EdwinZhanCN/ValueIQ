import { describe, expect, it } from "vitest";
import { buildRequest } from "../gemini";
import { main, runLive } from "../live-run";
import { ModelConfigError, resolveThinking } from "../models";
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

describe("K16 thinking option for the calculation model", () => {
  it("defaults to the low level, accepts levels, budgets and unset, and is sent as thinkingConfig", () => {
    expect(resolveThinking({})).toEqual({ level: "low" });
    expect(resolveThinking({ GEMINI_THINKING_CALC: "high" })).toEqual({
      level: "high",
    });
    expect(resolveThinking({ GEMINI_THINKING_CALC: "minimal" })).toEqual({
      level: "minimal",
    });
    expect(resolveThinking({ GEMINI_THINKING_CALC: "unset" })).toBeUndefined();
    expect(resolveThinking({ GEMINI_THINKING_CALC: "0" })).toEqual({
      budget: 0,
    });
    expect(resolveThinking({ GEMINI_THINKING_CALC: "1024" })).toEqual({
      budget: 1024,
    });
    expect(resolveThinking({ GEMINI_THINKING_BUDGET_CALC: "512" })).toEqual({
      budget: 512,
    });
    expect(() => resolveThinking({ GEMINI_THINKING_CALC: "lots" })).toThrow(
      ModelConfigError,
    );
    expect(() => resolveThinking({ GEMINI_THINKING_CALC: "-5" })).toThrow(
      ModelConfigError,
    );
    const none = buildRequest("s", [], TOOLS);
    expect("generationConfig" in none).toBe(false);
    const lvl = buildRequest("s", [], TOOLS, { level: "low" }) as {
      generationConfig?: { thinkingConfig: Record<string, unknown> };
    };
    expect(lvl.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: "low",
    });
    const bud = buildRequest("s", [], TOOLS, { budget: 0 }) as {
      generationConfig?: { thinkingConfig: Record<string, unknown> };
    };
    expect(bud.generationConfig?.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
});

describe("K16 narrative fallback and lean retry", () => {
  it("when the retry is rejected too, the engine narrative is used, rejected text is never output, and the source is recorded", async () => {
    const lines: string[] = [];
    const r = await runLive({
      dry: true,
      dryBadAlways: true,
      env: {},
      out: (l) => lines.push(l),
    });
    expect(r.ok).toBe(true);
    for (const n of r.narratives) {
      expect(n.source).toBe("engine");
      expect(n.text).not.toContain("8,181.82");
      expect(n.text.length).toBeGreaterThan(20);
    }
    const text = lines.join("\n");
    expect(text).toContain("narrative_source = engine");
    expect(text).toContain("GUARD REJECTED (attempt 2)");
    expect(
      r.narratives.find((n) => n.scenario === "sample-result")?.text,
    ).toContain("$127,956.73");
  });

  it("a passing model narrative is recorded as source model; a retry that passes is also model", async () => {
    const ok = await runLive({ dry: true, env: {}, out: () => undefined });
    expect(ok.narratives.every((n) => n.source === "model")).toBe(true);
    const retry = await runLive({
      dry: true,
      dryBadFirst: true,
      env: {},
      out: () => undefined,
    });
    expect(retry.ok).toBe(true);
    expect(retry.narratives.every((n) => n.source === "model")).toBe(true);
  });
});
