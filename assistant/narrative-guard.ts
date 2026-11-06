// Every model-written sentence that contains a number must (1) take the number from tool output
// and (2) cite a step ref (when the output has refs). Reuses the engine's narrative scan.
import { collectRefs, findUncitedNumbers, type RunOutput } from "../engine";

export interface Diagnosis {
  sentence: string;
  reason: string;
}

export class NarrativeRejectedError extends Error {
  /** Conversation up to and including the rejected model turn (set by the tool loop). */
  contents: unknown[] = [];
  diagnosis: Diagnosis[] = [];
  constructor(public readonly violations: string[]) {
    super(
      `Model text rejected by the narrative integrity scan (${violations.length} sentence(s))`,
    );
    this.name = "NarrativeRejectedError";
  }
}

const STRING_NUMBER = /(?<![A-Za-z])\d[\d,]*(?:\.\d+)?/g;

function leaves(x: unknown, out: number[]): void {
  if (typeof x === "number" && Number.isFinite(x)) out.push(x);
  else if (typeof x === "string") {
    // numbers written inside tool-output strings (payback text, labels, null reasons)
    if (/^\d{4}-\d{2}-\d{2}T/.test(x)) return;
    for (const m of x.matchAll(STRING_NUMBER)) {
      const v = Number(m[0].replace(/,/g, ""));
      if (Number.isFinite(v)) out.push(v);
    }
  } else if (Array.isArray(x)) for (const v of x) leaves(v, out);
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

/**
 * Remove markdown structure so list numerals, headings, bold markers, table pipes and rules are
 * not mistaken for numbers: "### Title", "1. item", "**bold**", "| a | b |", "---".
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, " ")
    .replace(/^[ \t]*\|?[ \t:|-]*-{3,}[ \t:|-]*\|?[ \t]*$/gm, " ")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:\d+[.)]|[-*+\u2022])(?:[ \t]+|$)/gm, "")
    .replace(/\*+|_{2,}|`+/g, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Offending sentences with the reason. `extra` are further tool outputs of the run whose numbers
 * the model may quote (for example preflight output before any compute).
 */
export function diagnoseModelText(
  text: string,
  out: RunOutput | null,
  extra: readonly unknown[] = [],
): Diagnosis[] {
  text = stripMarkdown(text);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
  const nums: number[] = [];
  if (out) {
    leaves(out.kind === "result" ? out.result : out.gap_list, nums);
    leaves(out.meta, nums);
  }
  leaves(extra, nums);
  const found = new Map<string, string>();
  if (out?.kind === "result" && out.result) {
    for (const s of findUncitedNumbers(text, collectRefs(out.result)))
      found.set(s, "number without a valid step ref after its last number");
  }
  for (const s of sentences) {
    const stripped = s.replace(/\[[^\]]*\]/g, " ");
    for (const m of stripped.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const v = Number(m[0].replace(/,/g, ""));
      if (!fromToolOutput(v, nums))
        found.set(s, `the number ${m[0]} is not in any tool output`);
    }
  }
  return [...found].map(([sentence, reason]) => ({ sentence, reason }));
}

/** Returns the offending sentences (empty = text passes). */
export function checkModelText(
  text: string,
  out: RunOutput | null,
  extra: readonly unknown[] = [],
): string[] {
  return diagnoseModelText(text, out, extra).map((d) => d.sentence);
}

export function assertModelText(
  text: string,
  out: RunOutput | null,
  extra: readonly unknown[] = [],
): void {
  const d = diagnoseModelText(text, out, extra);
  if (d.length > 0) {
    const e = new NarrativeRejectedError(d.map((x) => x.sentence));
    e.diagnosis = d;
    throw e;
  }
}
