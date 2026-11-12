import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { goldenResultForm, NOW } from "../../engine/tests/forms";
import {
  MaxStepsError,
  ModelMismatchError,
  RunCancelledError,
  runToolLoop,
  type GeminiEvent,
  type LoopOptions,
} from "../gemini";
import { DEFAULT_MODEL_CALC } from "../models";
import { MODEL_TOOLS, TOOLS, createContext } from "../tools";
import { call, fakeFetch, say, type FakeCall } from "./fake";

const KEY = "AIzaSyFAKE_ADAPTER_KEY_0123456789abcdef";

type Step = {
  parts: (
    | { type: "text"; text: string }
    | { type: "tool-call"; toolCallId: string; toolName: string; input: string }
  )[];
  modelVersion?: string | null;
  finish?: "tool-calls" | "stop";
};

/** A scripted AI SDK mock model; response.body carries the API's modelVersion like the Google provider. */
function mock(steps: Step[], seen: unknown[] = []): MockLanguageModelV4 {
  let n = 0;
  return new MockLanguageModelV4({
    doGenerate: (options: unknown) => {
      seen.push(options);
      const s = steps[Math.min(n, steps.length - 1)] as Step;
      n += 1;
      const hasCall = s.parts.some((p) => p.type === "tool-call");
      return Promise.resolve({
        content: s.parts,
        finishReason: {
          unified: s.finish ?? (hasCall ? "tool-calls" : "stop"),
          raw: undefined,
        },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
          raw: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            thoughtsTokenCount: 3,
            totalTokenCount: 18,
          },
        },
        warnings: [],
        response: {
          body:
            s.modelVersion === null
              ? {}
              : { modelVersion: s.modelVersion ?? DEFAULT_MODEL_CALC },
        },
      });
    },
  });
}

const tc = (
  name: string,
  input: object = {},
  id = name,
): Step["parts"][number] => ({
  type: "tool-call",
  toolCallId: id,
  toolName: name,
  input: JSON.stringify(input),
});
const txt = (text: string): Step["parts"][number] => ({ type: "text", text });

function opts(model: MockLanguageModelV4, extra: Partial<LoopOptions> = {}) {
  const ctx = createContext(goldenResultForm(), { run_id: "r", now: NOW });
  const events: GeminiEvent[] = [];
  const o: LoopOptions = {
    apiKey: KEY,
    model: DEFAULT_MODEL_CALC,
    system: "sys",
    contents: [{ role: "user", parts: [{ text: "go" }] }],
    tools: MODEL_TOOLS,
    ctx,
    testModel: model,
    log: (e) => events.push(e),
    ...extra,
  };
  return { o, ctx, events };
}

describe("K16 AI SDK adapter (mock language model)", () => {
  it("runs a tool and returns the final text, with request/response/tool_call/done events", async () => {
    const m = mock([
      { parts: [tc("validate_inputs")] },
      { parts: [txt("Done.")] },
    ]);
    const { o, events } = opts(m);
    const r = await runToolLoop(o);
    expect(r.status).toBe("done");
    expect(r.text).toBe("Done.");
    expect(events.map((e) => e.type)).toEqual([
      "request",
      "response",
      "tool_call",
      "request",
      "response",
      "done",
    ]);
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      tool: "validate_inputs",
    });
    expect(r.usage).toMatchObject({
      prompt: 20,
      output: 10,
      thoughts: 6,
      total: 36,
    });
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("strict modelVersion: a different or missing version throws ModelMismatchError and records it", async () => {
    for (const modelVersion of ["gemini-2.0-flash", null]) {
      const { o, events } = opts(mock([{ parts: [txt("hi")], modelVersion }]));
      await expect(runToolLoop(o)).rejects.toBeInstanceOf(ModelMismatchError);
      expect(events.some((e) => e.type === "model_mismatch")).toBe(true);
    }
    const { o } = opts(mock([{ parts: [txt("hi")] }]));
    await expect(runToolLoop(o)).resolves.toMatchObject({ status: "done" });
  });

  it("a mismatch on a later step stops before any further request", async () => {
    const seen: unknown[] = [];
    const m = mock(
      [
        { parts: [tc("validate_inputs")] },
        { parts: [txt("x")], modelVersion: "gemini-9" },
      ],
      seen,
    );
    const { o } = opts(m);
    await expect(runToolLoop(o)).rejects.toBeInstanceOf(ModelMismatchError);
    expect(seen).toHaveLength(2);
  });

  it("refuses undeclared tool calls: ask_user is not offered and never runs", async () => {
    const ask = tc("ask_user", {
      questions: [
        {
          input_id: "weeks_per_year",
          text: "Which value applies?",
          why_blocking: "It scales it",
        },
      ],
    });
    const seen: { tools?: { name: string }[] }[] = [];
    const m = mock([{ parts: [ask] }, { parts: [txt("Done.")] }], seen);
    const { o, ctx } = opts(m);
    const r = await runToolLoop(o);
    expect(r.status).toBe("done");
    expect(seen[0]?.tools?.map((t) => t.name)).not.toContain("ask_user");
    expect(ctx.state.asked_this_run).toEqual([]);
    expect(
      r.events.some(
        (e) =>
          e.type === "tool_call" &&
          e.tool === "ask_user" &&
          e.error_code === "UNKNOWN_TOOL",
      ),
    ).toBe(true);
  });

  it("keeps our own JSON Schema validation: bad arguments come back as INVALID_ARGS, no coercion", async () => {
    const m = mock([
      { parts: [tc("compute_haircut", { input_id: 7 })] },
      { parts: [txt("Done.")] },
    ]);
    const { o, events } = opts(m);
    await runToolLoop(o);
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      tool: "compute_haircut",
      error_code: "INVALID_ARGS",
    });
  });

  it("thinking goes through providerOptions.google.thinkingConfig (level or budget)", async () => {
    for (const [thinking, expected] of [
      [{ level: "low" as const }, { thinkingLevel: "low" }],
      [{ budget: 512 }, { thinkingBudget: 512 }],
    ] as const) {
      const seen: {
        providerOptions?: { google?: { thinkingConfig?: object } };
      }[] = [];
      const { o } = opts(mock([{ parts: [txt("Done.")] }], seen), { thinking });
      await runToolLoop(o);
      expect(seen[0]?.providerOptions?.google?.thinkingConfig).toEqual(
        expected,
      );
    }
    const seen: { providerOptions?: { google?: object } }[] = [];
    await runToolLoop(opts(mock([{ parts: [txt("Done.")] }], seen)).o);
    expect(seen[0]?.providerOptions?.google).toBeUndefined();
  });

  it("max steps: a model that keeps calling tools ends with MaxStepsError", async () => {
    const { o } = opts(mock([{ parts: [tc("validate_inputs")] }]), {
      maxSteps: 3,
    });
    await expect(runToolLoop(o)).rejects.toBeInstanceOf(MaxStepsError);
  });

  it("cancellation is checked before every model request", async () => {
    let n = 0;
    const seen: unknown[] = [];
    const { o } = opts(mock([{ parts: [tc("validate_inputs")] }], seen), {
      shouldStop: () => (n += 1) > 1,
    });
    await expect(runToolLoop(o)).rejects.toBeInstanceOf(RunCancelledError);
    expect(seen).toHaveLength(1);
  });

  it("the narrative guard still rejects uncited numbers in the final text", async () => {
    const m = mock([
      { parts: [tc("compute_project")] },
      { parts: [txt("The NPV is 8,181.82 dollars.")] },
    ]);
    const { o, events } = opts(m);
    await expect(runToolLoop(o)).rejects.toMatchObject({
      name: "NarrativeRejectedError",
    });
    expect(events.some((e) => e.type === "text_rejected")).toBe(true);
  });
});

describe("K16 AI SDK adapter (REST-level fake fetch through the real Google provider)", () => {
  it("sends the key only in x-goog-api-key, the exact model url, tools from the schemas, and thinkingConfig", async () => {
    const calls: FakeCall[] = [];
    const f = fakeFetch(
      [
        () => ({ parts: [call("validate_inputs")] }),
        () => ({ parts: [say("Done.")] }),
      ],
      calls,
    );
    const ctx = createContext(goldenResultForm(), { run_id: "r", now: NOW });
    await runToolLoop({
      apiKey: KEY,
      model: DEFAULT_MODEL_CALC,
      system: "s",
      contents: [{ role: "user", parts: [{ text: "go" }] }],
      tools: MODEL_TOOLS,
      ctx,
      fetch: f,
      thinking: { level: "low" },
    });
    const c0 = calls[0] as FakeCall;
    expect(c0.url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL_CALC}:generateContent`,
    );
    expect(c0.headers["x-goog-api-key"]).toBe(KEY);
    expect(c0.body).not.toContain(KEY);
    const body = JSON.parse(c0.body) as {
      generationConfig?: { thinkingConfig?: object };
      tools?: { functionDeclarations: { name: string }[] }[];
    };
    expect(body.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: "low",
    });
    expect(body.tools?.[0]?.functionDeclarations.map((d) => d.name)).toEqual(
      MODEL_TOOLS.map((t) => t.name),
    );
    expect(
      body.tools?.[0]?.functionDeclarations.map((d) => d.name),
    ).not.toContain("ask_user");
    expect(TOOLS.length).toBe(16);
  });
});
