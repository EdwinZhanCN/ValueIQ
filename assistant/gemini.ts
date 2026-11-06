// Minimal Gemini REST client with a tool-call loop. Plain fetch (injectable), no SDK.
// The API key is held in a closure, sent only in the x-goog-api-key header, and never logged.
import { toGeminiSchema } from "./schema";
import { assertExactModelId, type ThinkingSetting } from "./models";
import { NarrativeRejectedError, assertModelText } from "./narrative-guard";
import {
  ToolArgError,
  ToolRuntimeError,
  UnknownToolError,
  callTool,
  type ToolContext,
  type ToolDef,
} from "./tools";

export class ModelMismatchError extends Error {
  constructor(
    public readonly requested: string,
    public readonly returned: string | null,
  ) {
    super(
      `Model mismatch: requested ${requested}, API returned ${returned ?? "nothing"}`,
    );
    this.name = "ModelMismatchError";
  }
}
export class GeminiHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Gemini HTTP ${status}: ${message}`);
    this.name = "GeminiHttpError";
  }
}
export class MaxStepsError extends Error {
  constructor(public readonly steps: number) {
    super(`Tool loop exceeded ${steps} steps`);
    this.name = "MaxStepsError";
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface GeminiEvent {
  type:
    | "request"
    | "response"
    | "tool_call"
    | "model_mismatch"
    | "paused"
    | "text_rejected"
    | "narrative_source"
    | "done";
  model: string;
  step?: number;
  tool?: string;
  args_hash?: string;
  result_hash?: string;
  returned_model?: string | null;
  error_code?: string;
  tokens?: number;
  /** Who wrote the final narrative: the model (guard passed) or the engine (fallback). */
  source?: "model" | "engine";
  prompt_tokens?: number;
  output_tokens?: number;
  thought_tokens?: number;
  total_tokens?: number;
}

export interface Part {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [k: string]: unknown;
}
export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface LoopOptions {
  apiKey: string;
  model: string;
  system: string;
  contents: Content[];
  tools: readonly ToolDef[];
  ctx: ToolContext;
  fetch?: FetchLike;
  maxSteps?: number;
  guardText?: boolean;
  log?: (e: GeminiEvent) => void;
  baseUrl?: string;
  /** Thinking for this call: a level (Gemini 3) or a token budget; unset = model default. */
  thinking?: ThinkingSetting;
}

export interface LoopResult {
  status: "done" | "paused";
  text: string;
  contents: Content[];
  questions: unknown[];
  events: GeminiEvent[];
  usage: {
    prompt: number;
    output: number;
    thoughts: number;
    total: number;
  };
}

/** Small non-cryptographic hash (cyrb53) so logs carry ids and hashes, never contents. */
export function hashOf(x: unknown): string {
  const s = typeof x === "string" ? x : (JSON.stringify(x) ?? "");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Remove secrets (the key and anything shaped like a Google API key) from text. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of secrets) if (s) out = out.split(s).join("[redacted]");
  return out.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]");
}

export function buildRequest(
  system: string,
  contents: Content[],
  tools: readonly ToolDef[],
  thinking?: ThinkingSetting,
) {
  return {
    ...(thinking !== undefined
      ? {
          generationConfig: {
            thinkingConfig:
              "level" in thinking
                ? { thinkingLevel: thinking.level }
                : { thinkingBudget: thinking.budget },
          },
        }
      : {}),
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: toGeminiSchema(t.parameters),
        })),
      },
    ],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
  };
}

/** Append the user's answer to the last user turn (used to resume after ask_user). */
export function appendAnswer(contents: Content[], text: string): Content[] {
  const copy = structuredClone(contents);
  const last = copy[copy.length - 1];
  if (last && last.role === "user") last.parts.push({ text });
  else copy.push({ role: "user", parts: [{ text }] });
  return copy;
}

interface GeminiResponse {
  modelVersion?: string;
  candidates?: { content?: { parts?: Part[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

export async function runToolLoop(o: LoopOptions): Promise<LoopResult> {
  assertExactModelId(o.model, "model");
  const doFetch: FetchLike = o.fetch ?? ((url, init) => fetch(url, init));
  const base = o.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  const maxSteps = o.maxSteps ?? 12;
  const events: GeminiEvent[] = [];
  const emit = (e: GeminiEvent) => {
    events.push(e);
    o.log?.(e);
  };
  const usage = { prompt: 0, output: 0, thoughts: 0, total: 0 };
  const contents: Content[] = structuredClone(o.contents);

  for (let step = 1; step <= maxSteps; step++) {
    const body = JSON.stringify(
      buildRequest(o.system, contents, o.tools, o.thinking),
    );
    emit({ type: "request", model: o.model, step, args_hash: hashOf(body) });
    const res = await doFetch(`${base}/models/${o.model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": o.apiKey,
      },
      body,
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new GeminiHttpError(
        res.status,
        redact(raw.slice(0, 300), [o.apiKey]),
      );
    }
    const data = (await res.json()) as GeminiResponse;
    usage.prompt += data.usageMetadata?.promptTokenCount ?? 0;
    usage.output += data.usageMetadata?.candidatesTokenCount ?? 0;
    usage.thoughts += data.usageMetadata?.thoughtsTokenCount ?? 0;
    usage.total += data.usageMetadata?.totalTokenCount ?? 0;
    emit({
      type: "response",
      model: o.model,
      step,
      returned_model: data.modelVersion ?? null,
      prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      thought_tokens: data.usageMetadata?.thoughtsTokenCount ?? 0,
      total_tokens: data.usageMetadata?.totalTokenCount ?? 0,
    });
    const returned = data.modelVersion ?? null;
    if (returned !== o.model) {
      emit({
        type: "model_mismatch",
        model: o.model,
        step,
        returned_model: returned,
      });
      throw new ModelMismatchError(o.model, returned);
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) {
      const text = parts
        .filter((p) => p["thought"] !== true)
        .map((p) => p.text ?? "")
        .join("");
      if (o.guardText !== false) {
        try {
          assertModelText(text, o.ctx.state.last, o.ctx.state.seen);
        } catch (e) {
          emit({
            type: "text_rejected",
            model: o.model,
            step,
            result_hash: hashOf(text),
          });
          if (e instanceof NarrativeRejectedError)
            e.contents = [...contents, { role: "model", parts }];
          throw e;
        }
      }
      contents.push({ role: "model", parts });
      emit({ type: "done", model: o.model, step, tokens: usage.total });
      return { status: "done", text, contents, questions: [], events, usage };
    }
    contents.push({ role: "model", parts });
    const responses: Part[] = [];
    let paused = false;
    const questions: unknown[] = [];
    for (const p of calls) {
      const fc = p.functionCall as {
        name: string;
        args?: Record<string, unknown>;
      };
      let response: Record<string, unknown>;
      let code: string | undefined;
      try {
        const out = callTool(fc.name, fc.args ?? {}, o.ctx);
        response = { output: out };
        const po = out as { pause?: boolean; questions?: unknown[] };
        if (po && typeof po === "object" && po.pause === true) {
          paused = true;
          questions.push(...(po.questions ?? []));
        }
      } catch (e) {
        if (
          e instanceof ToolArgError ||
          e instanceof ToolRuntimeError ||
          e instanceof UnknownToolError
        ) {
          code = (e as { code: string }).code;
          response = {
            error: { code, message: redact(e.message, [o.apiKey]) },
          };
        } else throw e;
      }
      emit({
        type: "tool_call",
        model: o.model,
        step,
        tool: fc.name,
        args_hash: hashOf(fc.args ?? {}),
        result_hash: hashOf(response),
        ...(code ? { error_code: code } : {}),
      });
      responses.push({ functionResponse: { name: fc.name, response } });
    }
    contents.push({ role: "user", parts: responses });
    if (paused) {
      emit({ type: "paused", model: o.model, step });
      return { status: "paused", text: "", contents, questions, events, usage };
    }
  }
  throw new MaxStepsError(maxSteps);
}
