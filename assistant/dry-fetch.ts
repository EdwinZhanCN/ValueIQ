// Scripted fake model for `live-run --dry` and its test. No network, no key. The script calls the
// same tools in the same order as the real prompts ask for, then writes text from tool output.
import { formatMoney, type RunOutput } from "../engine";
import type { Content, FetchLike } from "./gemini";
import { CATALOG } from "../engine";
import { specFor } from "./evidence/find";
import { instructionLike } from "./intake";
import { call, fakeFetch, say, toolOutput, type FakeCall } from "./tests/fake";

export interface DryOptions {
  /** First narrative contains an invented, uncited number so the retry path runs. */
  badFirst?: boolean;
  /** Every narrative is bad, so the engine fallback runs. */
  badAlways?: boolean;
  /** Wait this long before each answer, so local progress is visible (default 0). */
  delayMs?: number;
}

function listAfter(prompt: string, label: string): string[] {
  const m = new RegExp(`${label}: ([^.]*)\\.`).exec(prompt);
  return m?.[1] ? m[1].split(",").map((x) => x.trim()) : [];
}

export function dryFetch(opts: DryOptions = {}): FetchLike {
  const answer = scripted(opts);
  const delay = opts.delayMs ?? 0;
  if (delay <= 0) return answer;
  return (url, init) =>
    new Promise((resolve) => setTimeout(resolve, delay)).then(() =>
      answer(url, init),
    );
}

function scripted(opts: DryOptions): FetchLike {
  return fakeFetch([
    (req) => {
      const decls = (
        JSON.parse(req.body) as {
          tools: { functionDeclarations: { name: string }[] }[];
        }
      ).tools[0]?.functionDeclarations.map((d) => d.name);
      if (decls?.includes("propose_input")) return intakeScript(req);
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

// ---------- Clarify assistant script (item 7) ----------
// Reads the user's message and calls tools in a fixed way: the opening checks, propose_input for
// figures next to words it knows, describe_input for "what does X mean", find_evidence or
// read_project_file when a file is named. Every guard in assistant/intake.ts and the tools still runs.

const FIGURE_WORDS: [RegExp, string][] = [
  [
    /^(?:\w+ ){0,2}(analysts?|people|staff|employees|persons?|users|clerks)\b/,
    "staff_affected",
  ],
  [/^(?:\w+ ){0,2}hours?\b.*\bweek/, "hours_saved_per_staff_week"],
  [/^(?:\w+ ){0,1}weeks?\b/, "weeks_per_year"],
  [/^(?:\w+ ){0,2}(an hour|per hour|hourly)\b/, "loaded_hourly_cost"],
];

function figures(message: string): { said: string; id: string }[] {
  const out: { said: string; id: string }[] = [];
  const lower = message.toLowerCase();
  for (const m of lower.matchAll(/(?<![\d.,])\d[\d,]*(?:\.\d+)?%?/g)) {
    const after = lower.slice((m.index ?? 0) + m[0].length).trim();
    const hit = FIGURE_WORDS.find(([re]) => re.test(after));
    if (hit && !out.some((f) => f.id === hit[1]))
      out.push({ said: m[0], id: hit[1] });
  }
  return out;
}

/** The catalog input whose label (or evidence hint) the message names. */
function inputNamed(lower: string): string | undefined {
  const ids = Object.keys(CATALOG).sort(
    (a, b) => CATALOG[b]!.label.length - CATALOG[a]!.label.length,
  );
  return (
    ids.find((id) => lower.includes(CATALOG[id]!.label.toLowerCase())) ??
    ids.find((id) => lower.includes(id.replace(/_/g, " "))) ??
    ids.find((id) =>
      (specFor(id)?.hints ?? []).some(
        (h) => h.split(" ").length > 1 && lower.includes(h),
      ),
    )
  );
}

function intakeScript(req: FakeCall) {
  const first = req.contents[0]?.parts[0]?.text ?? "";
  const goals = listAfter(first, "Goals");
  const message = /\nUser message: (.*)$/s.exec(first)?.[1] ?? "";
  const opening = message.startsWith("(opening turn");
  const lower = message.toLowerCase();
  const files = JSON.parse(
    /^Files \([^)]*\): (.*)$/m.exec(first)?.[1] ?? "[]",
  ) as { id: string; name: string }[];
  const file = files.find((f) =>
    f.name
      .toLowerCase()
      .replace(/\.[a-z]+$/, "")
      .split(/[^a-z]+/)
      .some((w) => w.length > 3 && w !== "synthetic" && lower.includes(w)),
  );
  const answered = req.contents.filter((c: Content) =>
    c.parts.some((p) => p.functionResponse),
  ).length;
  const rejected = req.contents.some((c) =>
    c.parts.some((p) => p.text?.includes("rejected by the integrity scan")),
  );

  let plan: ReturnType<typeof call>[] = [];
  let reply =
    "I can explain a field, look in a file, or turn a figure you type into a suggestion.";
  const named = inputNamed(lower);
  if (opening) {
    plan = [
      call("validate_inputs"),
      call("get_defaults", { goals }),
      call("preflight_gate"),
    ];
    reply =
      "Labeled defaults are listed below; each is used only if you accept it. The cards after them show what is still needed, costs first.";
  } else if (/\bwhat (does|is)\b|\bmean\b/.test(lower) && named) {
    plan = [call("describe_input", { input_id: named })];
    const out = toolOutput(req.contents, "describe_input") as
      { label: string; meaning: string } | undefined;
    if (out) reply = `${out.label}: ${out.meaning}`;
  } else if (file && /\b(find|look|search|evidence)\b/.test(lower)) {
    const id = named ?? "hours_saved_per_staff_week";
    plan = [call("find_evidence", { file_id: file.id, input_id: id })];
    reply =
      "I looked in the file. Quotes that match your figure word for word are below; use one only if it is right.";
  } else if (file && /\b(read|open|check)\b/.test(lower)) {
    plan = [call("read_project_file", { file_id: file.id })];
    const out = req.contents
      .flatMap((c) => c.parts)
      .find((p) => p.functionResponse?.name === "read_project_file");
    reply =
      out && instructionLike(JSON.stringify(out.functionResponse))
        ? "This file contains text asking me to change your figures. I did not act on it, and your inputs are unchanged."
        : "I read the file. Ask me to find a figure in it.";
  } else {
    const found = figures(message);
    if (found.length) {
      plan = found.map((f) =>
        call("propose_input", { input_id: f.id, said: f.said }),
      );
      reply =
        "I turned the figures in your message into suggestions below. Accept the ones that are right.";
    }
  }
  const next = rejected ? undefined : plan[answered];
  return { parts: [next ?? say(reply)] };
}
