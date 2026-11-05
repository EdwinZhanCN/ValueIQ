// Presentation helpers. The engine keeps full precision; rounding happens only here.

/** Round half-up (away from zero for ties on positive values) to `dp` decimals. */
export function roundHalfUp(x: number, dp: number): number {
  const f = Math.pow(10, dp);
  const s = x < 0 ? -1 : 1;
  return (s * Math.floor(Math.abs(x) * f + 0.5 + 1e-9)) / f;
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

/** Round half-up to 4 decimals (used for confidence values in the output). */
export function round4(x: number): number {
  return roundHalfUp(x, 4);
}

/**
 * Money with thousands separators, 2 decimals, half-up. USD/EUR/GBP use the symbol before the
 * number ("$127,956.73", "-$18,641.93"); other currencies put the ISO code after it.
 */
export function formatMoney(x: number, currency = ""): string {
  const r = roundHalfUp(x, 2);
  const [int = "0", frac = "00"] = Math.abs(r).toFixed(2).split(".");
  const num = `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
  const sign = r < 0 ? "-" : "";
  const sym = SYMBOLS[currency];
  if (sym) return `${sign}${sym}${num}`;
  return currency ? `${sign}${num} ${currency}` : `${sign}${num}`;
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
