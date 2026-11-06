// Live end-to-end check (run by hand with a key, or with --dry against a scripted fake model).
// Runs the sample-result and sample-gap-list forms through the FULL tool loop: the assistant model
// does pre-flight, the calculation model does the engine tools and writes the narrative, with the
// narrative guard ON. Logs carry ids and hashes only. The key is never printed or stored.
import { readFileSync } from "node:fs";
import { CATALOG, type FormFile, type RunOutput } from "../engine";
import { goldenGapForm, goldenResultForm } from "../engine/tests/forms";
import { dryFetch } from "./dry-fetch";
import {
  GeminiHttpError,
  ModelMismatchError,
  redact,
  type FetchLike,
  type GeminiEvent,
} from "./gemini";
import { describeThinking, resolveModels, resolveThinking } from "./models";
import {
  ASSISTANT_SYSTEM,
  ASSISTANT_TOOLS,
  CALC_SYSTEM,
  CALC_TOOLS,
} from "./prompts";
import { runGuarded } from "./guarded-loop";
import { TOOLS, createContext, type ToolContext } from "./tools";

/** Standard prices, USD per 1M tokens (assistant tier / calculation tier), valid through 2026-12-31. */
export const PRICES_PER_MILLION = {
  assistant: { input: 0.3, output: 2.5 },
  calc: { input: 0.75, output: 3.75 },
} as const;
type Role = keyof typeof PRICES_PER_MILLION;

const NOW = "2026-11-05T12:00:00Z"; // the date the fixtures were computed for (recency checks)
const REQUIRED: Record<Role, string[]> = {
  assistant: ASSISTANT_TOOLS,
  calc: [
    "compute_haircut",
    "compute_driver",
    "compute_project",
    "sensitivity",
    "get_confidence",
    "release_gate",
  ],
};

export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}
export interface ScenarioReport {
  name: string;
  checks: Check[];
  ok: boolean;
}
export interface RunReport {
  ok: boolean;
  narratives: { scenario: string; source: string; text: string }[];
  scenarios: ScenarioReport[];
  cost_usd: number;
  lines: string[];
}

type Tagged = GeminiEvent & { role: Role };

const closeTo = (actual: number, expected: number): boolean => {
  // fixtures are rounded (2 decimals; 4 for fractions), so the tolerance is the larger of 1e-6 relative and the rounding
  const tol =
    Math.abs(expected) < 1.5
      ? 5.1e-5
      : Math.max(1e-6 * Math.abs(expected), 5.1e-3);
  return Math.abs(actual - expected) <= tol;
};

function cmp(name: string, actual: unknown, expected: unknown): Check {
  if (expected === null || expected === undefined)
    return {
      name,
      pass: actual === null || actual === undefined,
      detail: `actual=${String(actual)} expected=null`,
    };
  if (typeof expected === "number") {
    const pass = typeof actual === "number" && closeTo(actual, expected);
    return {
      name,
      pass,
      detail: `actual=${String(actual)} expected=${expected}`,
    };
  }
  return {
    name,
    pass: actual === expected,
    detail: `actual=${String(actual)}`,
  };
}

function effectIds(form: FormFile): string[] {
  return form.inputs
    .filter((i) => CATALOG[i.id]?.role === "effect" && i.value !== null)
    .map((i) => i.id);
}

export interface LiveOptions {
  dry: boolean;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  fetch?: FetchLike;
  dryBadFirst?: boolean;
  dryBadAlways?: boolean;
}

export async function runLive(o: LiveOptions): Promise<RunReport> {
  // the scripted fake model has no thought signatures; the SDK warns about that in dry mode only
  if (o.dry)
    (globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS =
      false;
  const lines: string[] = [];
  const say = (l: string) => {
    lines.push(l);
    o.out(l);
  };
  const key = o.dry ? "dry-run-key" : (o.env["GEMINI_API_KEY"] ?? "");
  const models = resolveModels(o.env);
  const thinking = resolveThinking(o.env);
  const doFetch: FetchLike | undefined = o.dry
    ? dryFetch({
        ...(o.dryBadFirst ? { badFirst: true } : {}),
        ...(o.dryBadAlways ? { badAlways: true } : {}),
      })
    : o.fetch;
  const fixture = (name: string): unknown =>
    JSON.parse(
      readFileSync(
        new URL(`../engine/fixtures/${name}`, import.meta.url),
        "utf8",
      ),
    );
  const modelOf: Record<Role, string> = {
    assistant: models.assistant,
    calc: models.calc,
  };
  say(
    `live-run ${o.dry ? "(DRY: scripted fake model, no network)" : "(LIVE)"}; assistant=${models.assistant} calc=${models.calc} thinking(calc)=${describeThinking(thinking)}`,
  );

  const events: Tagged[] = [];
  const scenarios: ScenarioReport[] = [];
  const narratives: RunReport["narratives"] = [];

  async function phase(
    role: Role,
    ctx: ToolContext,
    system: string,
    userText: string,
    toolNames: string[],
  ): Promise<{
    text: string;
    ok: boolean;
    note: string;
    source: "model" | "engine" | "none";
  }> {
    const tools = TOOLS.filter((t) => toolNames.includes(t.name));
    try {
      const r = await runGuarded({
        apiKey: key,
        model: modelOf[role],
        system,
        tools,
        ctx,
        maxSteps: 16,
        userText,
        role,
        ...(doFetch ? { fetch: doFetch } : {}),
        ...(role === "calc" && thinking !== undefined ? { thinking } : {}),
        log: (e) => events.push({ ...e, role }),
        onReject: (d, attempt) =>
          say(
            `  [${role}] GUARD REJECTED (attempt ${attempt}): "${d.sentence}" because ${d.reason}`,
          ),
      });
      say(
        `  [${role}] narrative_source = ${r.source}${r.source === "engine" ? " (model text rejected twice)" : ""}`,
      );
      return { text: r.text, ok: true, note: r.note, source: r.source };
    } catch (e) {
      const msg = redact(e instanceof Error ? e.message : String(e), [key]);
      const kind =
        e instanceof ModelMismatchError
          ? "MODEL MISMATCH"
          : e instanceof GeminiHttpError
            ? "HTTP ERROR"
            : "ERROR";
      say(`  [${role}] ${kind}: ${msg}`);
      return { text: "", ok: false, note: kind, source: "none" };
    }
  }

  async function scenario(
    name: string,
    form: FormFile,
    fixtureFile: string,
    expectKind: "result" | "gap_list",
  ): Promise<void> {
    say(`\n== scenario: ${name} ==`);
    const start = events.length;
    const ctx = createContext(form, { run_id: `live_${name}`, now: NOW });
    const goals = form.goals.join(", ");
    const intro = `Goals: ${goals}. Effect inputs: ${effectIds(form).join(", ")}.`;
    const a = await phase(
      "assistant",
      ctx,
      ASSISTANT_SYSTEM,
      `Run the pre-flight for this project. ${intro}`,
      ASSISTANT_TOOLS,
    );
    const c = await phase(
      "calc",
      ctx,
      CALC_SYSTEM,
      `Run the full calculation loop now. ${intro}`,
      CALC_TOOLS,
    );

    narratives.push({ scenario: name, source: c.source, text: c.text });

    // ---- per-step table ----
    say("  step log (ids and hashes only):");
    const mine = events.slice(start);
    for (const e of mine.filter((x) => x.step !== undefined)) {
      if (e.type === "response")
        say(
          `  [${e.role}] step ${e.step} response  requested=${e.model} modelVersion=${e.returned_model ?? "(missing)"} tokens in=${e.prompt_tokens} out=${e.output_tokens} thinking=${e.thought_tokens} total=${e.total_tokens}`,
        );
      else if (e.type === "tool_call")
        say(
          `  [${e.role}] step ${e.step} tool      ${e.tool} args#${e.args_hash} result#${e.result_hash} ${e.error_code ? `ERROR ${e.error_code}` : "ok"}`,
        );
      else if (e.type === "narrative_source")
        say(`  [${e.role}] narrative_source ${e.source}`);
      else if (e.type === "text_rejected" || e.type === "model_mismatch")
        say(
          `  [${e.role}] step ${e.step} ${e.type} text#${e.result_hash ?? ""}`,
        );
    }

    const checks: Check[] = [];
    const last: RunOutput | null = ctx.state.last;
    const called = new Set<string>();
    for (const e of mine)
      if (e.type === "tool_call" && e.tool) called.add(e.tool);
    checks.push({
      name: "assistant phase finished",
      pass: a.ok,
      detail: a.note,
    });
    checks.push({
      name: "calc phase finished with an accepted narrative",
      pass: c.ok,
      detail: c.note,
    });
    for (const role of ["assistant", "calc"] as const)
      for (const t of REQUIRED[role])
        checks.push({
          name: `${role} called ${t}`,
          pass: called.has(t),
          detail: "",
        });
    checks.push({
      name: `run ends with ${expectKind}`,
      pass: last?.kind === expectKind,
      detail: `kind=${last?.kind ?? "none"}`,
    });

    const exp = fixture(fixtureFile) as RunOutput;
    if (expectKind === "result") {
      const h = last?.result?.headline;
      const eh = exp.result?.headline;
      if (h && eh) {
        checks.push(cmp("npv.hard", h.npv.hard, eh.npv.hard));
        checks.push(
          cmp(
            "npv.capacity_inclusive",
            h.npv.capacity_inclusive,
            eh.npv.capacity_inclusive,
          ),
        );
        checks.push(
          cmp(
            "roi.undiscounted.hard",
            h.roi.undiscounted.hard,
            eh.roi.undiscounted.hard,
          ),
        );
        checks.push(
          cmp(
            "roi.undiscounted.capacity_inclusive",
            h.roi.undiscounted.capacity_inclusive,
            eh.roi.undiscounted.capacity_inclusive,
          ),
        );
        checks.push(cmp("roi.pv.hard", h.roi.pv.hard, eh.roi.pv.hard));
        checks.push(
          cmp(
            "roi.pv.capacity_inclusive",
            h.roi.pv.capacity_inclusive,
            eh.roi.pv.capacity_inclusive,
          ),
        );
        checks.push(
          cmp(
            "payback.hard.years",
            h.payback.hard.years,
            eh.payback.hard.years,
          ),
        );
        checks.push(
          cmp(
            "payback.capacity_inclusive.years",
            h.payback.capacity_inclusive.years,
            eh.payback.capacity_inclusive.years,
          ),
        );
        checks.push(cmp("benefits_pv", h.benefits_pv, eh.benefits_pv));
        checks.push(cmp("costs_pv", h.costs_pv, eh.costs_pv));
        checks.push(
          cmp(
            "project confidence",
            last?.result?.confidence.project.confidence,
            exp.result?.confidence.project.confidence,
          ),
        );
      } else
        checks.push({
          name: "headline present",
          pass: false,
          detail: "no compute_project result",
        });
    } else {
      const g = last?.gap_list;
      const eg = exp.gap_list;
      checks.push({
        name: "no headline in the tool output",
        pass: last?.result === undefined && last !== null,
        detail: "",
      });
      checks.push(
        cmp(
          "gap project_confidence",
          g?.project_confidence,
          eg?.project_confidence,
        ),
      );
      checks.push(cmp("gap items count", g?.items.length, eg?.items.length));
      const headlineTalk = c.text
        .split(/(?<=[.!?])\s+/)
        .filter(
          (s) =>
            /\d/.test(s) && /npv|roi|payback|net present|return on/i.test(s),
        );
      checks.push({
        name: "narrative has no headline number",
        pass: headlineTalk.length === 0,
        detail: headlineTalk.join(" | "),
      });
    }
    for (const x of checks)
      say(
        `  ${x.pass ? "PASS" : "FAIL"} ${x.name}${x.detail ? `  (${x.detail})` : ""}`,
      );
    scenarios.push({ name, checks, ok: checks.every((x) => x.pass) });
  }

  for (const [name, form, file, kind] of [
    ["sample-result", goldenResultForm(), "sample-result.json", "result"],
    ["sample-gap-list", goldenGapForm(), "sample-gap-list.json", "gap_list"],
  ] as const) {
    await scenario(name, form, file, kind);
  }

  // ---- cost ----
  let cost = 0;
  say(
    "\ntokens and cost estimate (Standard prices; thinking tokens are billed as output):",
  );
  for (const role of ["assistant", "calc"] as const) {
    const r = events.filter((e) => e.role === role && e.type === "response");
    const inT = r.reduce((s, e) => s + (e.prompt_tokens ?? 0), 0);
    const outT = r.reduce((s, e) => s + (e.output_tokens ?? 0), 0);
    const thT = r.reduce((s, e) => s + (e.thought_tokens ?? 0), 0);
    const usd =
      (inT * PRICES_PER_MILLION[role].input +
        (outT + thT) * PRICES_PER_MILLION[role].output) /
      1e6;
    cost += usd;
    say(
      `  ${role.padEnd(9)} calls=${r.length} in=${inT} out=${outT} thinking=${thT}  ~$${usd.toFixed(6)}`,
    );
  }
  say(`  total ~$${cost.toFixed(6)}`);

  const ok = scenarios.every((s) => s.ok);
  say(
    `\nRESULT: ${ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED (see FAIL lines above)"}`,
  );
  return { ok, narratives, scenarios, cost_usd: cost, lines };
}

/** Entry point used by assistant/scripts/live-run.mjs. Returns the process exit code. */
export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  out: (l: string) => void = console.log,
): Promise<number> {
  const dry = argv.includes("--dry");
  if (!dry && !env["GEMINI_API_KEY"]) {
    out(
      "GEMINI_API_KEY is not set. Nothing was called. Set it in your shell and rerun (or pass --dry).",
    );
    return 0;
  }
  const report = await runLive({ dry, env, out });
  return report.ok ? 0 : 1;
}
