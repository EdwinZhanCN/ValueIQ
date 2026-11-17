// Item 6c: the run's "Files read" step looks every confirmed quote up in its file and records one
// quote_check event per input (ids and result only). It never changes the result or fails the run.
import { describe, expect, it } from "vitest";
import { NOW, goldenResultForm } from "../../engine/tests/forms";
import type { FormFile } from "../../engine/types";
import { dryFetch } from "../dry-fetch";
import type { ExtractedText } from "../evidence/extract/types";
import { quoteInFile } from "../evidence/find";
import { resolveModels } from "../models";
import { MemoryRunStore } from "../run/memory-store";
import { RunOrchestrator, type OrchestratorDeps } from "../run/orchestrator";
import type { RunView } from "../run/types";

const text: ExtractedText = {
  file_id: "f1",
  sha256: "x",
  kind: "xlsx",
  pages_or_sheets: [{ name: "Summary", kind: "sheet", rows: 2 }],
  segments: [
    { loc: "Summary!A5:B5", text: "Hours saved per analyst per week | 5" },
    {
      loc: "Summary!A6",
      text: "Each analyst saves 5 hours   per week in the pilot.",
    },
  ],
  truncated: false,
  warnings: [],
};

const files: NonNullable<OrchestratorDeps["files"]> = {
  extractedText: (id) =>
    Promise.resolve(
      id === "f1"
        ? { ok: true, text, name: "timesheet.xlsx" }
        : { ok: false, code: "FILE_UNREADABLE", message: "damaged" },
    ),
};

function cited(): FormFile {
  const form = goldenResultForm();
  const [a, b, c, d] = form.inputs;
  const cite = (
    input: (typeof form.inputs)[number] | undefined,
    file: string,
    quote: string,
    confirmed = true,
  ) => {
    if (input)
      input.backing = {
        ...input.backing,
        source_file_id: file,
        quote,
        quote_confirmed: confirmed,
      };
  };
  cite(a, "f1", "Each analyst saves 5 hours per week in the pilot");
  cite(b, "f1", "A sentence the file never had");
  cite(c, "f9", "Anything");
  cite(d, "f1", "Each analyst saves 5 hours per week", false);
  form.file_descriptions = {
    ...form.file_descriptions,
    f1: "Timesheet",
    f9: "Damaged sheet",
  };
  return form;
}

function run(form: FormFile, withFiles: boolean) {
  const store = new MemoryRunStore();
  const views: RunView[] = [];
  let n = 0;
  const orch = new RunOrchestrator({
    store,
    project_id: "p1",
    user_id: "u1",
    getForm: () => Promise.resolve(form),
    apiKey: "test-key",
    models: resolveModels({}),
    now: () => NOW,
    newRunId: () => `run-${++n}`,
    onView: (v) => views.push(v),
    fetch: dryFetch(),
    ...(withFiles ? { files } : {}),
  });
  return { orch, store, views };
}

describe("quoteInFile", () => {
  it("finds a quote word for word, whitespace aside, across passages too", () => {
    expect(quoteInFile(text, "saves 5 hours per week")).toBe(true);
    expect(quoteInFile(text, "per week | 5 Each analyst")).toBe(true);
    expect(quoteInFile(text, "saves 7 hours per week")).toBe(false);
    expect(quoteInFile(text, "   ")).toBe(false);
  });
});

describe("run quote check (item 6c)", () => {
  it("records found / not_found / unreadable per confirmed quote, ids only", async () => {
    const form = cited();
    const { orch, store, views } = run(form, true);
    const out = await orch.startRun();
    expect(out.view.error ?? null).toBeNull();
    expect(out.view.status).toBe("released");
    const events = (await store.listRunEvents("run-1")).filter(
      (e) => e.type === "quote_check",
    );
    const payloads = events.map(
      (e) =>
        JSON.parse(e.payload_json) as {
          input_id: string;
          file_id: string;
          result: string;
        },
    );
    const [a, b, c] = form.inputs;
    expect(payloads).toEqual([
      { input_id: a!.id, file_id: "f1", result: "found" },
      { input_id: b!.id, file_id: "f1", result: "not_found" },
      { input_id: c!.id, file_id: "f9", result: "unreadable" },
    ]);
    expect(events.every((e) => e.step === "Files read")).toBe(true);
    const dump = JSON.stringify(events);
    expect(dump).not.toContain("Each analyst");
    expect(dump).not.toContain("never had");
    // "Reading files and data" is in progress while the files are read
    expect(views[0]?.checklist[0]?.state).toBe("doing");
  });

  it("does not change the result", async () => {
    const withChecks = await run(cited(), true).orch.startRun();
    const without = await run(cited(), false).orch.startRun();
    expect(withChecks.output?.kind).toBe("result");
    const strip = (o: typeof withChecks.output) =>
      o?.kind === "result" ? o.result?.headline : null;
    expect(strip(withChecks.output)).toEqual(strip(without.output));
  });
});
