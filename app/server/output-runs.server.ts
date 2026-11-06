import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { runs, runResults } from "../../db/schema";
import { parseRunOutput, type RunOutput } from "../../shared/output";
import type { ProjectAccess } from "./access.server";

export type RunRecord = typeof runs.$inferSelect;
export type ResultSnapshot = { run: RunRecord; output: RunOutput | null };

export async function getRun(
  access: ProjectAccess,
  runId: string,
): Promise<ResultSnapshot | null> {
  const db = createDb(env.DB);
  const run = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.projectId, access.projectId)))
    .get();
  if (!run) return null;
  const row = await db
    .select()
    .from(runResults)
    .where(eq(runResults.runId, runId))
    .get();
  if (run.status !== "released" && run.status !== "gap_list")
    return { run, output: null };
  if (!row || (row.resultJson === null) === (row.gapListJson === null))
    throw new Error("ENGINE_INTEGRITY: missing run outcome");
  const output = parseRunOutput(row.resultJson ?? row.gapListJson);
  if (
    output.meta.run_id !== run.id ||
    output.meta.mode !== run.mode ||
    output.meta.contract_version !== run.contractVersion ||
    output.meta.formula_version !== run.formulaVersion ||
    output.meta.settings_version !== run.settingsVersion ||
    (output.kind === "result" ? "released" : "gap_list") !== run.status
  )
    throw new Error("ENGINE_INTEGRITY: run metadata mismatch");
  return { run, output };
}

/** Latest run, including pending/failed/gap outcomes; never fall back to an old release. */
export async function getLatestResult(
  access: ProjectAccess,
): Promise<ResultSnapshot | null> {
  const row = await createDb(env.DB)
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.projectId, access.projectId))
    .orderBy(desc(runs.startedAt), desc(runs.id))
    .get();
  return row ? getRun(access, row.id) : null;
}
