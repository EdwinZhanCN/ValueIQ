// The ONLY place that names a model. Keep this file free of imports and of enums so that
// `node` (type stripping) can import it from the live smoke script.

export const DEFAULT_MODEL_ASSISTANT = "gemini-3.5-flash-lite";
export const DEFAULT_MODEL_CALC = "gemini-3.6-flash";

export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

// exact, versioned ids only: gemini-<major>[.<minor>]-<variant...>
const EXACT_ID = /^gemini-\d+(\.\d+)?-[a-z0-9]+(-[a-z0-9.]+)*$/;

/** Throws unless `id` is an exact model id (no `-latest`, no unversioned alias). */
export function assertExactModelId(id: string, label = "model"): string {
  if (typeof id !== "string" || id.length === 0)
    throw new ModelConfigError(`${label}: empty model id`);
  if (/-latest$/.test(id) || /latest/.test(id))
    throw new ModelConfigError(
      `${label}: aliases such as "-latest" are not allowed (${id})`,
    );
  if (!EXACT_ID.test(id))
    throw new ModelConfigError(`${label}: not an exact model id (${id})`);
  return id;
}

export interface ModelIds {
  assistant: string;
  calc: string;
}

/** Defaults, overridable by GEMINI_MODEL_ASSISTANT and GEMINI_MODEL_CALC. */
export function resolveModels(
  env: Record<string, string | undefined> = {},
): ModelIds {
  const a = env["GEMINI_MODEL_ASSISTANT"] || DEFAULT_MODEL_ASSISTANT;
  const c = env["GEMINI_MODEL_CALC"] || DEFAULT_MODEL_CALC;
  return {
    assistant: assertExactModelId(a, "GEMINI_MODEL_ASSISTANT"),
    calc: assertExactModelId(c, "GEMINI_MODEL_CALC"),
  };
}

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";
/** Gemini 3 models take a thinking level; older ones take a token budget. */
export type ThinkingSetting = { level: ThinkingLevel } | { budget: number };

/**
 * Default thinking for the calculation-run model. The Gemini docs list thinking levels (minimal,
 * low, medium, high) for the Gemini 3 family and do not document a token budget for them, so the
 * default is the "low" level. A token budget is still possible through the env var.
 */
export const DEFAULT_THINKING_CALC: ThinkingSetting | undefined = {
  level: "low",
};

const LEVELS = ["minimal", "low", "medium", "high"];

/**
 * GEMINI_THINKING_CALC (alias GEMINI_THINKING_BUDGET_CALC): a level word (minimal|low|medium|high),
 * an integer token budget >= -1 (0 = off, -1 = dynamic), or "unset" for the model default.
 */
export function resolveThinking(
  env: Record<string, string | undefined> = {},
): ThinkingSetting | undefined {
  const raw = env["GEMINI_THINKING_CALC"] || env["GEMINI_THINKING_BUDGET_CALC"];
  if (raw === undefined || raw === "") return DEFAULT_THINKING_CALC;
  if (raw === "unset" || raw === "default") return undefined;
  if (LEVELS.includes(raw)) return { level: raw as ThinkingLevel };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < -1)
    throw new ModelConfigError(
      "GEMINI_THINKING_CALC must be minimal|low|medium|high, an integer >= -1, or unset",
    );
  return { budget: n };
}

export function describeThinking(t: ThinkingSetting | undefined): string {
  return t === undefined
    ? "unset"
    : "level" in t
      ? `level ${t.level}`
      : `budget ${t.budget}`;
}
