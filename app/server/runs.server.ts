import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { runs, runResults } from "../../db/schema";
import { parseRunOutput, type RunOutput } from "../../shared/output";
import type { ProjectAccess } from "./access.server";

export type RunRecord = typeof runs.$inferSelect;
export type ResultSnapshot = { run: RunRecord; output: RunOutput | null };

/** Internal workflow/engine entry point. Never expose result JSON as a browser write. */
export async function createRun(
  access: ProjectAccess,
  input: {
    mode: "real" | "stub";
    formHash: string;
    contractVersion: string;
    formulaVersion: string;
    settingsVersion: string;
    id?: string;
  },
) {
  const id = input.id ?? crypto.randomUUID();
  if (!/^[\w-]{1,128}$/.test(id)) throw new Error("BAD_INPUT: invalid run id");
  await createDb(env.DB).insert(runs).values({
    id,
    projectId: access.projectId,
    status: "running",
    mode: input.mode,
    formHash: input.formHash,
    contractVersion: input.contractVersion,
    formulaVersion: input.formulaVersion,
    settingsVersion: input.settingsVersion,
    startedBy: access.userId,
  });
  return id;
}

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

/** Publish one immutable validated output from trusted engine/workflow code. */
export async function finishRun(
  access: ProjectAccess,
  runId: string,
  value: unknown,
) {
  const output = parseRunOutput(value);
  const snapshot = await getRun(access, runId);
  if (!snapshot) throw new Error("BAD_INPUT: unknown project run");
  if (
    !["running", "preflight", "blocked_on_question"].includes(
      snapshot.run.status,
    )
  )
    throw new Error("BAD_INPUT: run is already terminal");
  if (
    output.meta.run_id !== runId ||
    output.meta.mode !== snapshot.run.mode ||
    output.meta.contract_version !== snapshot.run.contractVersion ||
    output.meta.formula_version !== snapshot.run.formulaVersion ||
    output.meta.settings_version !== snapshot.run.settingsVersion
  )
    throw new Error("ENGINE_INTEGRITY: run metadata mismatch");
  const serialized = JSON.stringify(output);
  if (new TextEncoder().encode(serialized).length > 512 * 1024)
    throw new Error("ENGINE_INTEGRITY: output exceeds storage limit");
  const now = Date.now();
  const rows = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO run_results (run_id,result_json,gap_list_json,created_at)
      SELECT ?,?,?,? FROM runs WHERE id=? AND project_id=? AND status IN ('running','preflight','blocked_on_question')`,
    ).bind(
      runId,
      output.kind === "result" ? serialized : null,
      output.kind === "gap_list" ? serialized : null,
      now,
      runId,
      access.projectId,
    ),
    env.DB.prepare(
      `UPDATE runs SET status=?,finished_at=? WHERE id=? AND project_id=? AND status IN ('running','preflight','blocked_on_question') AND EXISTS (SELECT 1 FROM run_results WHERE run_id=?)`,
    ).bind(
      output.kind === "result" ? "released" : "gap_list",
      now,
      runId,
      access.projectId,
      runId,
    ),
  ]);
  if (rows.some((row) => row.meta.changes !== 1))
    throw new Error("BAD_INPUT: run is already terminal");
  return output;
}
