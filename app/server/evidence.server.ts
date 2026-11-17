/**
 * File evidence for the Project pages (item 6):
 * - `findInFile`: Clarify's "Find in file". Runs the existing `find_evidence`
 *   tool against one project file for one input. The cheap model proposes
 *   passages; code keeps only quotes found word for word at their location.
 *   Nothing is written: the user picks "Use this quote" and confirms it.
 * - `quoteChecks`: the per-input results a run recorded when it read its
 *   files (run events of type `quote_check`), for Review's inputs table.
 *
 * File text is untrusted data. It never reaches a log; replies carry only the
 * verified quotes the user asked for.
 */
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { runEvents, runs } from "../../db/schema";
import {
  TOOLS,
  ToolRuntimeError,
  callToolDef,
  createContext,
} from "../../assistant/tools";
import { specFor } from "../../assistant/evidence/find";
import { geminiCompleter } from "../../assistant/evidence-completer";
import { dryEvidenceCompleter } from "../../assistant/dry-evidence";
import { resolveModels } from "../../assistant/models";
import { mapError } from "../../assistant/run/orchestrator";
import type { FormFile } from "../../engine/types";
import type { Input } from "../../shared/form";
import type { ProjectAccess } from "./access.server";
import { getExtractedText, makeFileHost } from "./file-text.server";
import { getProjectForm } from "./projects.server";
import {
  NO_KEY_MESSAGE,
  modelSource,
  type ModelSource,
} from "./run-wiring.server";

import type { EvidenceCandidate, EvidenceReply } from "../lib/evidence";
import type { QuoteCheck } from "../lib/entered-inputs";
export type { EvidenceCandidate, EvidenceReply } from "../lib/evidence";
export type { QuoteCheck } from "../lib/entered-inputs";

/** Whether "Find in file" can run here, and why not. Read by the Clarify loader. */
export function evidenceAvailability(): {
  available: boolean;
  scripted: boolean;
  reason: string | null;
} {
  const source = modelSource();
  return {
    available: source.kind !== "none",
    scripted: source.kind === "dry",
    reason: source.kind === "none" ? NO_KEY_MESSAGE : null,
  };
}

/** The cheap model that proposes passages, or the local scripted one. */
export function evidenceCompleter(
  source: Exclude<ModelSource, { kind: "none" }>,
) {
  const vars = env as unknown as Record<string, string | undefined>;
  return source.kind === "dry"
    ? dryEvidenceCompleter()
    : geminiCompleter({
        apiKey: source.apiKey,
        model: resolveModels(vars).assistant,
      });
}

const FIND = TOOLS.find((tool) => tool.name === "find_evidence")!;

const STATUS: Record<string, number> = {
  FILE_NOT_FOUND: 404,
  ACCESS_DENIED: 404,
  FOREIGN_FILE: 404,
  NO_MODEL: 503,
  MODEL_ERROR: 502,
};
export const evidenceStatus = (reply: EvidenceReply) =>
  reply.ok ? 200 : (STATUS[reply.code] ?? 400);

export async function findInFile(
  access: ProjectAccess,
  args: { inputId: string; fileId: string; value: number | null },
): Promise<EvidenceReply> {
  const fail = (code: string, message: string): EvidenceReply => ({
    ok: false,
    code,
    message,
  });
  if (!specFor(args.inputId))
    return fail(
      "NOT_EFFECT_INPUT",
      "Evidence is only looked up for effect inputs.",
    );
  const scope = { projectId: access.projectId, userId: access.userId };
  // The file must be in this project before anything else happens.
  const file = await getExtractedText(scope, args.fileId);
  if (!file.ok)
    return file.code === "FILE_NOT_FOUND" || file.code === "BAD_INPUT"
      ? fail("FILE_NOT_FOUND", "That file is not in this project.")
      : fail(file.code, `This file could not be read: ${file.message}`);

  const source = modelSource();
  if (source.kind === "none") return fail("NO_MODEL", NO_KEY_MESSAGE);
  const complete = evidenceCompleter(source);

  // The saved form, with this input's current (possibly unsaved) value; the
  // value is only used to say whether the file agrees with it.
  const saved = (await getProjectForm(access.projectId))?.formJson as
    Partial<FormFile> | undefined;
  const inputs = (Array.isArray(saved?.inputs) ? saved.inputs : []).filter(
    (input) => input?.id !== args.inputId,
  );
  const prior = (saved?.inputs ?? []).find((i) => i?.id === args.inputId) as
    Input | undefined;
  const form = {
    version: 1,
    goals: saved?.goals ?? [],
    currency: saved?.currency ?? "USD",
    horizon_years: saved?.horizon_years ?? 3,
    inputs: [
      ...inputs,
      {
        id: args.inputId,
        value: args.value,
        tier: prior?.tier ?? "estimate",
        origin: "user",
      },
    ],
    file_descriptions: {
      ...(saved?.file_descriptions ?? {}),
      [args.fileId]: saved?.file_descriptions?.[args.fileId] ?? "",
    },
    other_notes: saved?.other_notes ?? "",
    measurement_plan: saved?.measurement_plan ?? {},
    asked: saved?.asked ?? [],
  } as unknown as FormFile;
  const ctx = createContext(form, {
    run_id: "evidence-lookup",
    now: new Date().toISOString(),
    mode: source.mode,
    files: makeFileHost(scope, complete),
  });
  try {
    const out = (await callToolDef(
      FIND,
      { file_id: args.fileId, input_id: args.inputId },
      ctx,
    )) as {
      candidates: (EvidenceCandidate & Record<string, unknown>)[];
      rejected: { count: number };
    };
    return {
      ok: true,
      fileName: file.name,
      scripted: source.kind === "dry",
      candidates: out.candidates.map((c) => ({
        quote: c.quote,
        location: c.location,
        value_in_quote: c.value_in_quote,
        parsed_value: c.parsed_value,
        form_check: c.form_check,
        ...(c.note ? { note: c.note } : {}),
      })),
      rejected: out.rejected.count,
    };
  } catch (e) {
    if (e instanceof ToolRuntimeError) return fail(e.code, e.message);
    const error = mapError(e);
    return fail("MODEL_ERROR", error.message);
  }
}

/** The quote checks a run recorded, by input id. Empty for runs before item 6. */
export async function quoteChecks(
  projectId: string,
  runId: string,
): Promise<Record<string, QuoteCheck>> {
  const rows = await createDb(env.DB)
    .select({ payload: runEvents.payloadJson })
    .from(runEvents)
    .innerJoin(runs, eq(runs.id, runEvents.runId))
    .where(
      and(
        eq(runs.projectId, projectId),
        eq(runEvents.runId, runId),
        eq(runEvents.type, "quote_check"),
      ),
    )
    .all();
  const out: Record<string, QuoteCheck> = {};
  for (const row of rows) {
    let d = row.payload as { input_id?: unknown; result?: unknown } | null;
    if (typeof d === "string") {
      try {
        d = JSON.parse(d) as typeof d;
      } catch {
        continue;
      }
    }
    if (
      typeof d?.input_id === "string" &&
      (d.result === "found" ||
        d.result === "not_found" ||
        d.result === "unreadable")
    )
      out[d.input_id] = d.result;
  }
  return out;
}
