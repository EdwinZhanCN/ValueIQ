// Presentation helpers. The engine keeps full precision; rounding happens only here.

/** Round half-up (away from zero for ties on positive values) to `dp` decimals. */
export function roundHalfUp(x: number, dp: number): number {
  const f = Math.pow(10, dp);
  const s = x < 0 ? -1 : 1;
  return (s * Math.floor(Math.abs(x) * f + 0.5 + 1e-9)) / f;
}

/** Money with thousands separators, 2 decimals, half-up. */
export function formatMoney(x: number, currency = ""): string {
  const r = roundHalfUp(x, 2);
  const [int = "0", frac = "00"] = Math.abs(r).toFixed(2).split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${r < 0 ? "-" : ""}${currency ? currency + " " : ""}${withCommas}.${frac}`;
}

/** Percent with one decimal, half-up. */
export function formatPct(x: number): string {
  return `${roundHalfUp(x, 1).toFixed(1)}%`;
}

/** Throws if a value is not JSON-safe (NaN, Infinity, undefined, Date, functions). */
export function assertJsonSafe(v: unknown, path = "$"): void {
  if (v === null) return;
  switch (typeof v) {
    case "number":
      if (!Number.isFinite(v)) throw new Error(`Non-finite number at ${path}`);
      return;
    case "string":
    case "boolean":
      return;
    case "object": {
      if (v instanceof Date) throw new Error(`Date at ${path}`);
      if (Array.isArray(v)) {
        v.forEach((x, i) => assertJsonSafe(x, `${path}[${i}]`));
        return;
      }
      for (const [k, x] of Object.entries(v as Record<string, unknown>))
        assertJsonSafe(x, `${path}.${k}`);
      return;
    }
    default:
      throw new Error(`Unsupported ${typeof v} at ${path}`);
  }
}
