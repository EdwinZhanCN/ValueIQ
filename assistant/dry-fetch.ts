// Scripted fake model for `live-run --dry` and its test. No network, no key. The script calls the
// same tools in the same order as the real prompts ask for, then writes text from tool output.
import { formatMoney, type RunOutput } from "../engine";
import type { Content, FetchLike } from "./gemini";
import { call, fakeFetch, say, toolOutput } from "./tests/fake";

export interface DryOptions {
  /** First narrative contains an invented, uncited number so the retry path runs. */
  badFirst?: boolean;
  /** Every narrative is bad, so the engine fallback runs. */
  badAlways?: boolean;
}

function listAfter(prompt: string, label: string): string[] {
  const m = new RegExp(`${label}: ([^.]*)\\.`).exec(prompt);
  return m?.[1] ? m[1].split(",").map((x) => x.trim()) : [];
}

export function dryFetch(opts: DryOptions = {}): FetchLike {
  return fakeFetch([
    (req) => {
      const decls = (
        JSON.parse(req.body) as {
          tools: { functionDeclarations: { name: string }[] }[];
        }
      ).tools[0]?.functionDeclarations.map((d) => d.name);
      const isCalc = decls?.includes("compute_project") ?? false;
      const first = req.contents[0]?.parts[0]?.text ?? "";
      const goals = listAfter(first, "Goals");
      const effects = listAfter(first, "Effect inputs");
      const answered = req.contents.filter((c: Content) =>
        c.parts.some((p) => p.functionResponse),
      ).length;
      const plan = isCalc
        ? [
            ...effects.map((id) => call("compute_haircut", { input_id: id })),
            ...goals.map((g) => call("compute_driver", { driver_id: g })),
            call("compute_project", {}),
            call("sensitivity", { param: "discount_rate" }),
            call("get_confidence"),
            call("release_gate"),
          ]
        : [
            call("validate_inputs"),
            call("get_defaults", { goals }),
            call("preflight_gate"),
          ];
      const rejected = req.contents.some((c) =>
        c.parts.some((p) => p.text?.includes("rejected by the integrity scan")),
      );
      const next = rejected ? undefined : plan[answered];
      if (next) return { parts: [next] };
      if (!isCalc)
        return {
          parts: [say("Pre-flight is complete for the selected goals.")],
        };
      if (opts.badAlways || (opts.badFirst && !rejected))
        return {
          parts: [say("The project returns an NPV of 8,181.82 dollars.")],
        };
      // lean retry: the tool results arrive as JSON text inside the retry message
      const retryText =
        req.contents
          .flatMap((c) => c.parts)
          .map((p) => p.text ?? "")
          .find((t) => t.includes("Engine tool results")) ?? "";
      const m =
        /Engine tool results[^\n]*:\n([\s\S]*?)\n\nYour previous text/.exec(
          retryText,
        );
      if (m?.[1]) {
        const data = JSON.parse(m[1]) as {
          kind: string;
          currency?: string;
          horizon_years?: number;
          headline?: { npv: { capacity_inclusive: number } };
          cost_lines?: { ref: string }[];
        };
        if (data.kind === "result" && data.headline) {
          const refs = (data.cost_lines ?? []).map((l) => l.ref).join(", ");
          return {
            parts: [
              say(
                `Over ${data.horizon_years} years the capacity-inclusive NPV is ${formatMoney(data.headline.npv.capacity_inclusive, data.currency)} [${refs}].`,
              ),
            ],
          };
        }
      } else {
        const out = toolOutput(req.contents, "compute_project") as RunOutput;
        if (out.kind === "result" && out.result) {
          const n = out.result.narrative;
          return {
            parts: [
              say(`${n.summary} ${n.by_driver.time_savings ?? ""}`.trim()),
            ],
          };
        }
      }
      return {
        parts: [
          say(
            "There is not enough backed evidence to give a result. See the gap list for what to add.",
          ),
        ],
      };
    },
  ]);
}
