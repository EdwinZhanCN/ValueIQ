// Gemini client on the Vercel AI SDK (`ai` + `@ai-sdk/google`), used only as a library inside the Worker.
// The API key is held in the provider, sent only in the x-goog-api-key header, and never logged.
// Same exported interface as before (runToolLoop, LoopOptions, LoopResult, events, errors).
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  APICallError,
  generateText,
  jsonSchema,
  stepCountIs,
  tool,
  wrapLanguageModel,
  type LanguageModelMiddleware,
  type ModelMessage,
  type ToolSet,
} from "ai";
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
export class RunCancelledError extends Error {
  constructor() {
    super("Run cancelled");
    this.name = "RunCancelledError";
  }
}
export class MaxStepsError extends Error {
  constructor(public readonly steps: number) {
    super(`Tool loop exceeded ${steps} steps`);
    this.name = "MaxStepsError";
  }
}

/** A fetch with a simple signature; it must return a standard `Response`. Injectable for tests. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

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
  /** Test double: use this language model (for example ai/test MockLanguageModelV4) instead of the Google provider. */
  testModel?: Parameters<typeof wrapLanguageModel>[0]["model"];
  /** Checked before every model request; true ends the loop with RunCancelledError. */
  shouldStop?: () => boolean | Promise<boolean>;
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

function toSdkFetch(f: FetchLike): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return f(url, {
      method: init?.method ?? "POST",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? init.body : "",
    });
  };
}

function toMessages(contents: Content[]): ModelMessage[] {
  return contents.map((c) => {
    if (c.parts.some((p) => p.functionCall || p.functionResponse))
      throw new Error("runToolLoop accepts text-only starting contents");
    const text = c.parts.map((p) => p.text ?? "").join("");
    return c.role === "model"
      ? { role: "assistant", content: text }
      : { role: "user", content: text };
  });
}

interface RawUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}

export async function runToolLoop(o: LoopOptions): Promise<LoopResult> {
  assertExactModelId(o.model, "model");
  const maxSteps = o.maxSteps ?? 12;
  const events: GeminiEvent[] = [];
  const emit = (e: GeminiEvent) => {
    events.push(e);
    o.log?.(e);
  };
  const usage = { prompt: 0, output: 0, thoughts: 0, total: 0 };
  let step = 0;
  let paused = false;
  const questions: unknown[] = [];

  const provider = createGoogleGenerativeAI({
    apiKey: o.apiKey,
    ...(o.baseUrl ? { baseURL: o.baseUrl } : {}),
    ...(o.fetch ? { fetch: toSdkFetch(o.fetch) } : {}),
  });

  // one place sees every model call: cancellation, events, tokens and the strict modelVersion check
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params }) => {
      if (o.shouldStop && (await o.shouldStop())) throw new RunCancelledError();
      step += 1;
      const n = step;
      emit({
        type: "request",
        model: o.model,
        step: n,
        args_hash: hashOf(params.prompt),
      });
      const r = await doGenerate();
      const raw = (r.usage.raw ?? {}) as RawUsage;
      const prompt = raw.promptTokenCount ?? r.usage.inputTokens.total ?? 0;
      const output = raw.candidatesTokenCount ?? r.usage.outputTokens.text ?? 0;
      const thoughts =
        raw.thoughtsTokenCount ?? r.usage.outputTokens.reasoning ?? 0;
      const total = raw.totalTokenCount ?? prompt + output + thoughts;
      usage.prompt += prompt;
      usage.output += output;
      usage.thoughts += thoughts;
      usage.total += total;
      // the API's own modelVersion (the SDK only echoes the requested id in response.modelId)
      const body = r.response?.body as { modelVersion?: unknown } | undefined;
      const returned =
        typeof body?.modelVersion === "string" ? body.modelVersion : null;
      emit({
        type: "response",
        model: o.model,
        step: n,
        returned_model: returned,
        prompt_tokens: prompt,
        output_tokens: output,
        thought_tokens: thoughts,
        total_tokens: total,
      });
      if (returned !== o.model) {
        emit({
          type: "model_mismatch",
          model: o.model,
          step: n,
          returned_model: returned,
        });
        throw new ModelMismatchError(o.model, returned);
      }
      return r;
    },
  };
  const model = wrapLanguageModel({
    model: o.testModel ?? provider(o.model),
    middleware,
  });

  // only the declared tools exist; our own validation, error codes and pause signal run inside execute
  const tools: ToolSet = {};
  for (const t of o.tools) {
    tools[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.parameters as Parameters<typeof jsonSchema>[0]),
      execute: (args: unknown): Record<string, unknown> => {
        let response: Record<string, unknown>;
        let code: string | undefined;
        try {
          const out = callTool(t.name, args ?? {}, o.ctx);
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
          tool: t.name,
          args_hash: hashOf(args ?? {}),
          result_hash: hashOf(response),
          ...(code ? { error_code: code } : {}),
        });
        return response;
      },
    });
  }

  const thinkingOptions =
    o.thinking === undefined
      ? {}
      : {
          providerOptions: {
            google: {
              thinkingConfig:
                "level" in o.thinking
                  ? { thinkingLevel: o.thinking.level }
                  : { thinkingBudget: o.thinking.budget },
            },
          },
        };

  const result = await generateText({
    model,
    system: o.system,
    messages: toMessages(o.contents),
    tools,
    toolChoice: "auto",
    maxRetries: 0,
    stopWhen: [stepCountIs(maxSteps), () => paused],
    ...thinkingOptions,
  }).catch((e: unknown) => {
    if (APICallError.isInstance(e))
      throw new GeminiHttpError(
        e.statusCode ?? 0,
        redact(e.message.slice(0, 300), [o.apiKey]),
      );
    throw e;
  });

  // refused calls (a tool that was not declared, or arguments the SDK could not parse)
  for (const s of result.steps)
    for (const part of s.content as {
      type: string;
      toolName?: string;
      invalid?: boolean;
    }[])
      if (
        part.type === "tool-error" &&
        part.toolName &&
        !o.tools.some((t) => t.name === part.toolName)
      )
        emit({
          type: "tool_call",
          model: o.model,
          step,
          tool: part.toolName,
          error_code: "UNKNOWN_TOOL",
        });

  const contents = rebuildContents(o.contents, result.steps);
  const last = result.steps[result.steps.length - 1];
  if (paused) {
    emit({ type: "paused", model: o.model, step });
    return { status: "paused", text: "", contents, questions, events, usage };
  }
  if (last && last.finishReason === "tool-calls")
    throw new MaxStepsError(maxSteps);

  const text = result.text;
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
      if (e instanceof NarrativeRejectedError) e.contents = contents;
      throw e;
    }
  }
  emit({ type: "done", model: o.model, step, tokens: usage.total });
  return { status: "done", text, contents, questions: [], events, usage };
}

/** Best-effort Gemini-shaped transcript of the run (for logs and a later resume). */
type StepList = {
  text: string;
  toolCalls: { toolName: string; input: unknown }[];
  toolResults: { toolName: string; output: unknown }[];
}[];

function rebuildContents(start: Content[], steps: StepList): Content[] {
  const out: Content[] = structuredClone(start);
  for (const s of steps) {
    const modelParts: Part[] = [];
    if (s.text) modelParts.push({ text: s.text });
    for (const c of s.toolCalls)
      modelParts.push({
        functionCall: {
          name: c.toolName,
          args: c.input as Record<string, unknown>,
        },
      });
    if (modelParts.length) out.push({ role: "model", parts: modelParts });
    if (s.toolResults.length)
      out.push({
        role: "user",
        parts: s.toolResults.map((r) => ({
          functionResponse: {
            name: r.toolName,
            response: r.output as Record<string, unknown>,
          },
        })),
      });
  }
  return out;
}
