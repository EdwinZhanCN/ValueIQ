// Narrative integrity scan: every sentence that contains a number must cite a known step ref.
import type { GapList, Result, RunOutput } from "./types";

/** All step and cost-line refs in a result. */
export function collectRefs(result: Result): Set<string> {
  const refs = new Set<string>();
  for (const d of result.drivers) for (const s of d.steps) refs.add(s.ref);
  for (const l of result.costs.lines) refs.add(l.ref);
  return refs;
}

/**
 * Returns the sentences that contain a number but do not cite a known [ref] after their last
 * number (so "10 [A1] and also 20." is flagged), or that cite an unknown ref.
 */
export function findUncitedNumbers(
  text: string,
  refs: ReadonlySet<string>,
): string[] {
  const bad: string[] = [];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
  for (const s of sentences) {
    const groups = [...s.matchAll(/\[([^\]]*)\]/g)];
    const inBracket = (i: number) =>
      groups.some((g) => i >= g.index && i < g.index + g[0].length);
    let lastNum = -1;
    for (let i = 0; i < s.length; i++)
      if (/\d/.test(s.charAt(i)) && !inBracket(i)) lastNum = i;
    if (lastNum < 0) continue;
    const allRefs = groups.flatMap((g) =>
      (g[1] ?? "").split(",").map((r) => r.trim()),
    );
    const after = groups.filter((g) => g.index > lastNum);
    if (after.length === 0 || !allRefs.every((r) => refs.has(r))) bad.push(s);
  }
  return bad;
}

/** Scan the whole narrative of a result. */
export function scanNarrative(result: Result): string[] {
  const refs = collectRefs(result);
  const texts = [
    result.narrative.summary,
    ...Object.values(result.narrative.by_driver),
  ];
  return texts.flatMap((t) => findUncitedNumbers(t, refs));
}

/** Deterministic text for a gap list: numbers come straight from the gap list. */
export function gapNarrative(gap: GapList): string {
  return `There is not enough backed evidence to give a result. Project confidence is ${gap.project_confidence} against a floor of ${gap.project_floor}. Add the evidence listed in the gap list to raise it.`;
}

/**
 * The engine's own deterministic narrative for any output (summary plus one sentence per driver,
 * or the gap-list text). Used when the model's text is rejected twice; always passes the scan.
 */
export function engineNarrative(out: RunOutput): string {
  if (out.kind === "result" && out.result) {
    const n = out.result.narrative;
    return [n.summary, ...Object.values(n.by_driver)].join(" ");
  }
  return out.gap_list ? gapNarrative(out.gap_list) : "";
}
