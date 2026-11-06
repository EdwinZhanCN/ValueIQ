// Manual live check of file evidence (Eli runs assistant/scripts/live-evidence.mjs). It builds a sample
// Word memo and a sample Excel workbook, extracts them, runs find_evidence through the real tool,
// and prints the verified candidates, the rejected count and the token cost.
//   GEMINI_API_KEY=... node assistant/scripts/live-evidence.mjs     (real cheap model)
//   node assistant/scripts/live-evidence.mjs --dry                  (scripted fake model, no key, no network)
// The key comes from the environment or the gitignored .dev.vars and is never printed.
import { goldenResultForm } from "../engine/tests/forms";
import type { FormFile } from "../engine";
import { geminiCompleter } from "./evidence/completer";
import { extractFileText, type ExtractedText } from "./evidence/extract";
import type {
  EvidenceEvent,
  FileEvidenceHost,
  StructuredCompleter,
  Usage,
} from "./evidence/host";
import { buildExcerpt } from "./evidence/text";
import { redact } from "./gemini";
import { resolveModels } from "./models";
import { callToolDef, createContext, TOOLS } from "./tools";
import { buildDocx, buildXlsx } from "./tests/evidence-fixtures";

/** Standard price of the assistant tier, USD per 1M tokens (same table as live-run.ts). */
const PRICE = { input: 0.3, output: 2.5 };
const NOW = "2026-11-05T12:00:00Z";

async function samples(): Promise<ExtractedText[]> {
  const memo = await extractFileText({
    fileId: "sample-memo",
    name: "pilot-memo.docx",
    mime: "",
    bytes: buildDocx([
      { p: "Support pilot results", style: "Heading1" },
      {
        p: "During the 12-week pilot each analyst saved an average of 5 hours per week across 1,240 tickets, measured on 2026-09-30.",
      },
      { p: "Management hopes to reach 9 hours per week by next year." },
      {
        table: [
          ["Queue", "Hours saved per week"],
          ["Billing", "5"],
          ["Returns", "4"],
        ],
      },
    ]),
  });
  const book = await extractFileText({
    fileId: "sample-errors",
    name: "error-log.xlsx",
    mime: "",
    bytes: buildXlsx([
      {
        name: "Summary",
        rows: [
          ["Metric", "Value"],
          ["Errors in the last 12 months", 72],
          ["Average cost to fix one error (USD)", 690],
          ["Records processed", 48000],
        ],
      },
      {
        name: "Monthly",
        rows: [
          ["Month", "Errors"],
          ["Jan", 5],
          ["Feb", 7],
        ],
      },
    ]),
  });
  return [memo, book];
}

/** What a careful model would return, plus one invented quote that code must reject. */
const DRY_ANSWERS: Record<string, unknown[]> = {
  "sample-memo:hours_saved_per_staff_week": [
    {
      quote:
        "each analyst saved an average of 5 hours per week across 1,240 tickets",
      location: "p2",
      value_in_quote: "5 hours",
      observations: 1240,
      period_months: 3,
      source_date: "2026-09-30",
      note: "Measured pilot average",
    },
    {
      quote: "analysts saved 6 hours every week",
      location: "p2",
      value_in_quote: "6 hours",
    },
  ],
  "sample-errors:error_count_before": [
    {
      quote: "Errors in the last 12 months | 72",
      location: "Summary!A2:B2",
      value_in_quote: "72",
      period_months: 12,
    },
  ],
  "sample-errors:cost_per_error": [
    {
      quote: "Average cost to fix one error (USD) | 690",
      location: "Summary!B3",
      value_in_quote: "690",
    },
  ],
};

export async function run(
  dry: boolean,
  env: Record<string, string | undefined>,
  out: (l: string) => void,
): Promise<boolean> {
  const texts = await samples();
  const byId = Object.fromEntries(texts.map((t) => [t.file_id, t]));
  const usage: Usage = { prompt: 0, output: 0, thoughts: 0, total: 0 };
  let model = "(scripted)";
  let current = "";
  const scripted: StructuredCompleter = async () => ({
    value: { candidates: DRY_ANSWERS[current] ?? [] },
    usage: { prompt: 0, output: 0, thoughts: 0, total: 0 },
    model: "(scripted)",
  });
  let complete: StructuredCompleter = scripted;
  if (!dry) {
    const apiKey = env["GEMINI_API_KEY"] as string;
    model = resolveModels(env).assistant;
    complete = geminiCompleter({ apiKey, model });
  }
  const counted: StructuredCompleter = async (req) => {
    const r = await complete(req);
    usage.prompt += r.usage.prompt;
    usage.output += r.usage.output;
    usage.thoughts += r.usage.thoughts;
    usage.total += r.usage.total;
    return r;
  };
  const events: EvidenceEvent[] = [];
  const host: FileEvidenceHost = {
    readForModel: async (id, req) => {
      const t = byId[id];
      return t
        ? { ok: true, excerpt: buildExcerpt(t, id, req) }
        : { ok: false, code: "FILE_NOT_FOUND", message: "not in this project" };
    },
    extractedText: async (id) => {
      const t = byId[id];
      return t
        ? { ok: true, text: t, name: id }
        : { ok: false, code: "FILE_NOT_FOUND", message: "not in this project" };
    },
    complete: counted,
    log: (e) => events.push(e),
  };
  const form: FormFile = {
    ...goldenResultForm(),
    file_descriptions: {
      "sample-memo": "pilot memo",
      "sample-errors": "error log",
    },
  };
  const ctx = createContext(form, {
    run_id: "live-evidence",
    now: NOW,
    files: host,
  });
  const tool = TOOLS.find((t) => t.name === "find_evidence");
  if (!tool) throw new Error("find_evidence is not registered");

  out(
    `File evidence live check (${dry ? "DRY: scripted model" : `model ${model}`})`,
  );
  for (const t of texts)
    out(
      `  ${t.file_id}: ${t.kind}, ${t.segments.length} segments, sha256 ${t.sha256.slice(0, 12)}, truncated=${t.truncated}${t.warnings.length ? `, warnings=${t.warnings.length}` : ""}`,
    );

  const jobs: [string, string][] = [
    ["sample-memo", "hours_saved_per_staff_week"],
    ["sample-errors", "error_count_before"],
    ["sample-errors", "cost_per_error"],
  ];
  let ok = true;
  let accepted = 0;
  let rejected = 0;
  for (const [fileId, inputId] of jobs) {
    current = `${fileId}:${inputId}`;
    const r = (await callToolDef(
      tool,
      { file_id: fileId, input_id: inputId },
      ctx,
    )) as {
      candidates: {
        id: string;
        quote: string;
        location: string;
        value_in_quote: string;
        form_check: string;
        unverified_fields: string[];
        dropped_fields: string[];
        proposal: { proposed_tier?: string } | null;
        proposal_error?: string;
      }[];
      rejected: { count: number; reasons: Record<string, number> };
      coverage: {
        segments_sent: number;
        segments_total: number;
        complete: boolean;
      };
      extractor_problem?: string;
    };
    out(
      `\n${inputId} in ${fileId} (sent ${r.coverage.segments_sent}/${r.coverage.segments_total} segments)`,
    );
    for (const c of r.candidates)
      out(
        `  VERIFIED ${c.id} at ${c.location}: "${c.quote}" -> ${c.value_in_quote} [${c.form_check}]${c.unverified_fields.length ? ` check yourself: ${c.unverified_fields.join(",")}` : ""}${c.dropped_fields.length ? ` dropped: ${c.dropped_fields.join(",")}` : ""}${c.proposal ? " proposal ready (needs your confirmation)" : ` no proposal (${c.proposal_error ?? "none"})`}`,
      );
    out(
      `  rejected ${r.rejected.count} ${JSON.stringify(r.rejected.reasons)}${r.extractor_problem ? ` extractor problem: ${r.extractor_problem}` : ""}`,
    );
    accepted += r.candidates.length;
    rejected += r.rejected.count;
    if (dry && r.candidates.length === 0) ok = false;
  }
  const usd =
    (usage.prompt * PRICE.input +
      (usage.output + usage.thoughts) * PRICE.output) /
    1e6;
  out(
    `\nTotals: ${accepted} verified, ${rejected} rejected. Tokens: in=${usage.prompt} out=${usage.output} thinking=${usage.thoughts} total=${usage.total}  ~$${usd.toFixed(6)}`,
  );
  if (dry && (accepted !== 3 || rejected !== 1)) {
    out("FAIL: the dry run should verify 3 and reject 1 (the invented quote)");
    ok = false;
  }
  out(`\nRESULT: ${ok ? "OK" : "CHECK THE LINES ABOVE"}`);
  return ok;
}

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
  try {
    return (await run(dry, env, out)) ? 0 : 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out(`live-evidence failed: ${redact(msg, [env["GEMINI_API_KEY"] ?? ""])}`);
    return 1;
  }
}
