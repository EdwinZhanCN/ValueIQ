// Every model-written sentence that contains a number must (1) take the number from tool output
// and (2) cite a step ref (when the output has refs). Reuses the engine's narrative scan.
import { collectRefs, findUncitedNumbers, type RunOutput } from "../engine";

export class NarrativeRejectedError extends Error {
  constructor(public readonly violations: string[]) {
    super(
      `Model text rejected by the narrative integrity scan (${violations.length} sentence(s))`,
    );
    this.name = "NarrativeRejectedError";
  }
}

function leaves(x: unknown, out: number[]): void {
  if (typeof x === "number" && Number.isFinite(x)) out.push(x);
  else if (Array.isArray(x)) for (const v of x) leaves(v, out);
  else if (typeof x === "object" && x !== null)
    for (const v of Object.values(x)) leaves(v, out);
}

function fromToolOutput(v: number, nums: number[]): boolean {
  return nums.some((raw) => {
    const n = Math.abs(raw);
    return (
      Math.abs(n - v) <= 0.005 + 1e-9 ||
      Math.abs(n - v) <= 0.05 + 1e-9 ||
      Math.round(n) === v ||
      Math.abs(n * 100 - v) <= 0.05 + 1e-9
    );
  });
}

/** Returns the offending sentences (empty = text passes). */
export function checkModelText(text: string, out: RunOutput | null): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
  const hasDigit = (s: string) => /\d/.test(s.replace(/\[[^\]]*\]/g, ""));
  if (!out) return sentences.filter(hasDigit);
  const nums: number[] = [];
  leaves(out.kind === "result" ? out.result : out.gap_list, nums);
  leaves(out.meta, nums);
  const bad = new Set<string>();
  if (out.kind === "result" && out.result) {
    for (const s of findUncitedNumbers(text, collectRefs(out.result)))
      bad.add(s);
  }
  for (const s of sentences) {
    const stripped = s.replace(/\[[^\]]*\]/g, " ");
    for (const m of stripped.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const v = Number(m[0].replace(/,/g, ""));
      if (!fromToolOutput(v, nums)) bad.add(s);
    }
  }
  return [...bad];
}

export function assertModelText(text: string, out: RunOutput | null): void {
  const v = checkModelText(text, out);
  if (v.length > 0) throw new NarrativeRejectedError(v);
}
