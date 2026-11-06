// One tool loop with the narrative guard ON: on a rejection it retries once with a lean message
// (the rejection plus the last tool results, not the whole history); if that is rejected too it
// falls back to the engine's own deterministic narrative. Rejected model text is never returned.
import { engineNarrative } from "../engine";
import {
  runToolLoop,
  type Content,
  type GeminiEvent,
  type LoopOptions,
  type LoopResult,
} from "./gemini";
import { NarrativeRejectedError, checkModelText } from "./narrative-guard";
import type { ToolContext } from "./tools";

export interface GuardedOptions extends Omit<LoopOptions, "contents" | "log"> {
  /** The original request text; repeated in the lean retry. */
  userText: string;
  role: "assistant" | "calc";
  log?: (e: GeminiEvent) => void;
  /** Called for every rejected sentence (for diagnostics). */
  onReject?: (d: { sentence: string; reason: string }, attempt: number) => void;
}

export interface GuardedResult {
  status: "done" | "paused";
  text: string;
  source: "model" | "engine";
  note: string;
  contents: Content[];
  questions: unknown[];
}

/** Compact, verbatim engine results for a retry (refs, values, confidence, warnings). */
export function lastResults(
  role: "assistant" | "calc",
  ctx: ToolContext,
): unknown {
  if (role === "assistant") return ctx.state.seen.slice(-1);
  const o = ctx.state.last;
  if (!o) return null;
  if (o.kind === "gap_list") return { kind: o.kind, gap_list: o.gap_list };
  const r = o.result;
  return {
    kind: o.kind,
    currency: o.meta.currency,
    horizon_years: o.meta.horizon_years,
    headline: r?.headline,
    drivers: r?.drivers.map((d) => ({
      id: d.id,
      label: d.label,
      total: d.total,
      steps: d.steps.map((x) => ({
        ref: x.ref,
        label: x.label,
        value: x.value,
      })),
    })),
    cost_lines: r?.costs.lines.map((l) => ({
      ref: l.ref,
      label: l.label,
      adjusted: l.adjusted,
    })),
    confidence: r?.confidence.project,
    warnings: r?.warnings,
  };
}

export async function runGuarded(o: GuardedOptions): Promise<GuardedResult> {
  const { userText, role, onReject, log, ...loop } = o;
  const ctx = o.ctx;
  const emit = (e: GeminiEvent) => log?.(e);
  let contents: Content[] = [{ role: "user", parts: [{ text: userText }] }];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r: LoopResult = await runToolLoop({
        ...loop,
        contents,
        ...(log ? { log } : {}),
      });
      if (r.status === "paused")
        return {
          status: "paused",
          text: "",
          source: "model",
          note: "paused",
          contents: r.contents,
          questions: r.questions,
        };
      emit({ type: "narrative_source", model: o.model, source: "model" });
      return {
        status: "done",
        text: r.text,
        source: "model",
        note: attempt === 2 ? "passed after one retry" : "",
        contents: r.contents,
        questions: [],
      };
    } catch (e) {
      if (!(e instanceof NarrativeRejectedError)) throw e;
      for (const d of e.diagnosis) onReject?.(d, attempt);
      if (attempt === 2) {
        const fb = ctx.state.last
          ? engineNarrative(ctx.state.last)
          : "Pre-flight finished; see the structured pre-flight output.";
        if (checkModelText(fb, ctx.state.last, ctx.state.seen).length > 0)
          throw new Error(
            "Engine fallback narrative failed the integrity scan",
            { cause: e },
          );
        emit({ type: "narrative_source", model: o.model, source: "engine" });
        return {
          status: "done",
          text: fb,
          source: "engine",
          note: "engine fallback",
          contents,
          questions: [],
        };
      }
      const why = e.diagnosis
        .map((d) => `"${d.sentence}" (${d.reason})`)
        .join("; ");
      contents = [
        {
          role: "user",
          parts: [
            {
              text: `${userText}\n\nEngine tool results (the only numbers you may use):\n${JSON.stringify(lastResults(role, ctx))}\n\nYour previous text was rejected by the integrity scan: ${why}. Write the narrative again as plain text with no markdown, using only numbers from the tool results above, with the step refs in square brackets after the last number of every sentence that has a number. Do not call tools.`,
            },
          ],
        },
      ];
    }
  }
  throw new Error("unreachable");
}
