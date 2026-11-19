import type { Coverage, Recommendation } from "./types";
import { formatMoney } from "./present";

export interface RecommendInput {
  currency: string;
  /** NPV of the expected scenario, capacity-inclusive. */
  expected: number;
  conservative: number | null;
  optimistic: number | null;
  /** NPV of documented cash reduction alone; null when there is none. */
  hard: number | null;
  coverage: Coverage;
  /** Benefit per year still needed to break even (positive means short). */
  shortfall: number | null;
}

/**
 * The suggested action, from the numbers only (no model). Rules, in order:
 *  - Positive even in the conservative case, and every selected goal counted: implement.
 *  - Positive in the expected case but not robust (conservative case negative, or goals left out): pilot.
 *  - Not positive and goals were left out: not enough to decide (the counted goals do not pay back alone).
 *  - Not positive in the expected case but positive in the optimistic case: do not implement as scoped.
 *  - Negative in every scenario with every goal counted: do not implement.
 */
export function recommend(i: RecommendInput): Recommendation {
  const money = (n: number) => formatMoney(n, i.currency);
  const partial = i.coverage.excluded.length > 0;
  const reasons: string[] = [];
  reasons.push(`Expected NPV ${money(i.expected)}.`);
  if (i.conservative !== null && i.optimistic !== null)
    reasons.push(
      `Conservative ${money(i.conservative)}, optimistic ${money(i.optimistic)}.`,
    );
  if (i.hard === null)
    reasons.push(
      "No documented cash reduction; value is freed time or avoided loss.",
    );
  else reasons.push(`Documented cash savings alone: NPV ${money(i.hard)}.`);
  if (partial) reasons.push(i.coverage.text);
  if (i.shortfall !== null && i.shortfall > 0)
    reasons.push(
      `It needs ${money(i.shortfall)} more benefit per year to break even.`,
    );

  const cons = i.conservative ?? i.expected;
  const opt = i.optimistic ?? i.expected;
  if (i.expected > 0 && cons > 0 && !partial)
    return {
      action: "implement",
      label: "Implement",
      text: "The project pays back even under conservative assumptions.",
      reasons,
    };
  if (i.expected > 0)
    return {
      action: "pilot",
      label: "Pilot first",
      text: partial
        ? "It pays back on the goals counted, but some selected goals are not in the result. Pilot it and confirm those before a full commitment."
        : "It pays back in the expected case but not under conservative assumptions. Pilot it and measure before a full commitment.",
      reasons,
    };
  if (partial)
    return {
      action: "need_more_info",
      label: "Not enough to decide",
      text: "The goals counted do not pay back alone, and other selected goals are not counted. Add evidence for those goals before deciding.",
      reasons,
    };
  if (opt > 0)
    return {
      action: "reconsider",
      label: "Do not implement as scoped",
      text: "It does not pay back in the expected case and only does if optimistic assumptions hold. Rescope, cut cost, or find stronger value first.",
      reasons,
    };
  return {
    action: "do_not_implement",
    label: "Do not implement",
    text: "It does not pay back in any scenario on the goals selected.",
    reasons,
  };
}
