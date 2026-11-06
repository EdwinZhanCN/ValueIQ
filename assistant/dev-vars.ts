// Loads GEMINI_API_KEY from a local .dev.vars file (KEY=VALUE lines) when it is not in the environment.
// Only GEMINI_API_KEY is read. The value is returned to the caller and never printed or logged.
// No imports, no enums: Node can load this file directly with type stripping.

/** Parse KEY=VALUE lines (comments and blank lines ignored, optional quotes stripped). */
export function parseDevVars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      (value.startsWith('"') || value.startsWith("'")) &&
      value.endsWith(value[0] as string)
    )
      value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/**
 * The key from the environment, else from .dev.vars (via the injected reader), else undefined.
 * `read` returns the file text or undefined when the file does not exist.
 */
export function loadGeminiKey(
  env: Record<string, string | undefined>,
  read: () => string | undefined,
): string | undefined {
  const fromEnv = env["GEMINI_API_KEY"];
  if (fromEnv) return fromEnv;
  let text: string | undefined;
  try {
    text = read();
  } catch {
    return undefined;
  }
  if (text === undefined) return undefined;
  const v = parseDevVars(text)["GEMINI_API_KEY"];
  return v ? v : undefined;
}
