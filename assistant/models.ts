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
