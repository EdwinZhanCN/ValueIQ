// Live smoke check on the SAME code path as production (runToolLoop on the AI SDK): one
// function-calling round trip per model. Prints the requested model, the returned modelVersion,
// whether a tool call came back, and tokens. The key is never printed.
import { goldenResultForm } from "../engine/tests/forms";
import { redact, runToolLoop, type GeminiEvent } from "./gemini";
import { describeThinking, resolveModels, resolveThinking } from "./models";
import { TOOLS, createContext } from "./tools";

export async function main(
  env: Record<string, string | undefined>,
  out: (l: string) => void = console.log,
): Promise<number> {
  const key = env["GEMINI_API_KEY"];
  if (!key) {
    out(
      "GEMINI_API_KEY is not set (environment or .dev.vars). Nothing was called.",
    );
    return 0;
  }
  const models = resolveModels(env);
  const thinking = resolveThinking(env);
  let ok = true;
  for (const [label, model] of [
    ["assistant", models.assistant],
    ["calc", models.calc],
  ] as const) {
    const events: GeminiEvent[] = [];
    out(
      `[${label}] requested model : ${model}${label === "calc" ? ` (thinking ${describeThinking(thinking)})` : ""}`,
    );
    try {
      const ctx = createContext(goldenResultForm(), {
        run_id: `smoke_${label}`,
        now: "2026-11-05T12:00:00Z",
      });
      await runToolLoop({
        apiKey: key,
        model,
        system:
          "You are a smoke test. Call the tool validate_inputs exactly once, then reply with the single word done.",
        contents: [{ role: "user", parts: [{ text: "Run the smoke test." }] }],
        tools: TOOLS.filter((t) => t.name === "validate_inputs"),
        ctx,
        maxSteps: 4,
        guardText: false,
        ...(label === "calc" && thinking !== undefined ? { thinking } : {}),
        log: (e) => events.push(e),
      });
    } catch (e) {
      out(
        `[${label}] failed: ${redact(e instanceof Error ? e.message : String(e), [key])}`,
      );
      ok = false;
    }
    const responses = events.filter((e) => e.type === "response");
    const called = events.some(
      (e) =>
        e.type === "tool_call" && e.tool === "validate_inputs" && !e.error_code,
    );
    const returned = responses[0]?.returned_model ?? "(none)";
    const sum = (f: "prompt_tokens" | "output_tokens" | "thought_tokens") =>
      responses.reduce((s, e) => s + (e[f] ?? 0), 0);
    out(`[${label}] modelVersion     : ${returned}`);
    out(
      `[${label}] matches request  : ${responses.length > 0 && responses.every((e) => e.returned_model === model)}`,
    );
    out(
      `[${label}] function call    : ${called ? "yes (validate_inputs)" : "no"}`,
    );
    out(
      `[${label}] tokens           : prompt ${sum("prompt_tokens")}, output ${sum("output_tokens")}, thinking ${sum("thought_tokens")}`,
    );
    ok =
      ok &&
      called &&
      responses.length > 0 &&
      responses.every((e) => e.returned_model === model);
  }
  out(
    ok
      ? "RESULT: both models answered with a tool call and the expected modelVersion (same code path as production)."
      : "RESULT: check the lines above.",
  );
  return ok ? 0 : 1;
}
