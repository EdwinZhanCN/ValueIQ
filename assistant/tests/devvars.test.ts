import { describe, expect, it } from "vitest";
import { loadGeminiKey, parseDevVars } from "../dev-vars";
import { runToolLoop } from "../gemini";
import { DEFAULT_MODEL_CALC } from "../models";
import { MODEL_TOOLS, TOOLS, createContext } from "../tools";
import { goldenResultForm, NOW } from "../../engine/tests/forms";
import { call, fakeFetch, say, type FakeCall } from "./fake";

describe("K16 key loading from .dev.vars (values here are fake)", () => {
  const FAKE = "AIzaFAKE_FOR_TESTS_ONLY_0123456789";
  it("parses KEY=VALUE lines, comments and quotes", () => {
    expect(
      parseDevVars(`# c\nA=1\n\nGEMINI_API_KEY="${FAKE}"\nB = two\nbad line`),
    ).toEqual({
      A: "1",
      GEMINI_API_KEY: FAKE,
      B: "two",
    });
  });
  it("environment wins; else the file; else undefined; read errors are swallowed", () => {
    expect(
      loadGeminiKey({ GEMINI_API_KEY: "env" }, () => `GEMINI_API_KEY=${FAKE}`),
    ).toBe("env");
    expect(loadGeminiKey({}, () => `OTHER=1\nGEMINI_API_KEY=${FAKE}`)).toBe(
      FAKE,
    );
    expect(loadGeminiKey({}, () => "OTHER=1")).toBeUndefined();
    expect(loadGeminiKey({}, () => undefined)).toBeUndefined();
    expect(
      loadGeminiKey({}, () => {
        throw new Error("nope");
      }),
    ).toBeUndefined();
  });
});

describe("K16 ask_user is disabled by config for the model", () => {
  it("the tool and its tests stay, but the model is not offered it and cannot call it", async () => {
    expect(TOOLS.map((t) => t.name)).toContain("ask_user");
    expect(MODEL_TOOLS.map((t) => t.name)).not.toContain("ask_user");
    expect(MODEL_TOOLS).toHaveLength(15);
    const calls: FakeCall[] = [];
    const f = fakeFetch(
      [
        () => ({
          parts: [
            call("ask_user", {
              questions: [
                {
                  input_id: "weeks_per_year",
                  text: "Which value applies?",
                  why_blocking: "It scales the benefit",
                },
              ],
            }),
          ],
        }),
        () => ({ parts: [say("Done.")] }),
      ],
      calls,
    );
    const ctx = createContext(goldenResultForm(), { run_id: "r", now: NOW });
    const r = await runToolLoop({
      apiKey: "k",
      model: DEFAULT_MODEL_CALC,
      system: "s",
      contents: [{ role: "user", parts: [{ text: "go" }] }],
      tools: MODEL_TOOLS,
      ctx,
      fetch: f,
    });
    expect(r.status).toBe("done");
    expect(JSON.stringify(JSON.parse(calls[0]?.body ?? "{}"))).not.toContain(
      "ask_user",
    );
    const resp = calls[1]?.contents.at(-1)?.parts[0]?.functionResponse
      ?.response as { error?: string };
    expect(resp.error).toContain("unavailable tool");
    expect(ctx.state.asked_this_run).toEqual([]);
  });
});
