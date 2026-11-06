// The cheap-model call behind find_evidence, on the same Gemini client as the assistant. The model id
// comes from assistant/models.ts (the assistant model); this file names no model.
import {
  generateStructured,
  type FetchLike,
  type GeminiEvent,
  type StructuredOptions,
} from "../gemini";
import type { ThinkingSetting } from "../models";
import type { StructuredCompleter } from "./host";

export interface CompleterOptions {
  apiKey: string;
  /** The assistant model id from resolveModels(env).assistant. */
  model: string;
  fetch?: FetchLike;
  baseUrl?: string;
  thinking?: ThinkingSetting;
  testModel?: StructuredOptions["testModel"];
  log?: (e: GeminiEvent) => void;
  shouldStop?: () => boolean | Promise<boolean>;
}

export function geminiCompleter(o: CompleterOptions): StructuredCompleter {
  return async (req) => {
    const r = await generateStructured({
      apiKey: o.apiKey,
      model: o.model,
      system: req.system,
      prompt: req.prompt,
      schema: req.schema,
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}),
      ...(o.thinking ? { thinking: o.thinking } : {}),
      ...(o.testModel ? { testModel: o.testModel } : {}),
      ...(o.log ? { log: o.log } : {}),
      ...(o.shouldStop ? { shouldStop: o.shouldStop } : {}),
    });
    return {
      value: r.value,
      ...(r.problem ? { problem: r.problem } : {}),
      usage: r.usage,
      model: o.model,
    };
  };
}
