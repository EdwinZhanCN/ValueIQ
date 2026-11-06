/**
 * Server API for calculation runs (integration contract sections 4 and 5).
 *
 * Nothing here checks access. The agent gate and `requireProjectAccess`
 * authorize first; agent methods that change a run re-check membership with
 * `getProjectMembership`. Callers never get a raw D1 handle.
 *
 * Result/gap publications validate the complete RunOutput envelope here.
 * Consumer reads validate again in output-runs.server.ts.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { runEvents, runQuestions, runResults, runs } from "../../db/schema";
import type {
  Question,
  RunMode,
  StoredRunStatus,
} from "../../shared/types";

import { parseRunOutput } from "../../shared/output";

export type Run = typeof runs.$inferSelect;

export type NewRun = {
  /** Also the workflow instance id; defaults to a random UUID. */
  id?: string;
  projectId: string;
  mode: RunMode;
  formHash: string;
  contractVersion: string;
  formulaVersion: string;
  settingsVersion: string;
  /** The connection's user id, never a method argument. */
  startedBy: string;
  status?: Extract<StoredRunStatus, "preflight" | "running">;
};

export async function createRun(input: NewRun): Promise<Run> {
  if (input.id && !/^[\w-]{1,128}$/.test(input.id)) throw new Error("BAD_INPUT: invalid run id");
  return createDb(env.DB)
    .insert(runs)
    .values({
      id: input.id ?? crypto.randomUUID(),
      projectId: input.projectId,
      status: input.status ?? "preflight",
      mode: input.mode,
      formHash: input.formHash,
      contractVersion: input.contractVersion,
      formulaVersion: input.formulaVersion,
      settingsVersion: input.settingsVersion,
      startedBy: input.startedBy,
    })
    .returning()
    .get();
}

export async function getRun(runId: string): Promise<Run | null> {
  return (
    (await createDb(env.DB)
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .get()) ?? null
  );
}

/** Moves an unfinished run between active states. False if it has ended. */
export async function updateRunStatus(
  runId: string,
  status: Extract<
    StoredRunStatus,
    "preflight" | "running" | "blocked_on_question"
  >,
): Promise<boolean> {
  const row = await createDb(env.DB)
    .update(runs)
    .set({ status })
    .where(and(eq(runs.id, runId), isNull(runs.finishedAt)))
    .returning({ id: runs.id })
    .get();
  return Boolean(row);
}

/**
 * Appends one audit event. `seq` is assigned by the agent; a repeated
 * (run, seq) pair is ignored, so a retried step does not log twice.
 */
export async function appendRunEvent(
  runId: string,
  event: { seq: number; type: string; step?: string | null; payload?: unknown },
): Promise<void> {
  await createDb(env.DB)
    .insert(runEvents)
    .values({
      runId,
      seq: event.seq,
      type: event.type,
      step: event.step ?? null,
      payloadJson: event.payload,
    })
    .onConflictDoNothing();
}

/** Records an `ask_user` question. Repeating it (a retried step) is a no-op. */
export async function recordRunQuestion(question: Question): Promise<void> {
  await createDb(env.DB)
    .insert(runQuestions)
    .values({ id: question.id, runId: question.run_id, payloadJson: question })
    .onConflictDoNothing();
}

/**
 * Stores the answer to a still-open question of this run. False when the
 * question is not this run's or was already answered.
 */
export async function answerRunQuestion(
  runId: string,
  questionId: string,
  answer: unknown,
  answeredBy: string,
): Promise<boolean> {
  const row = await createDb(env.DB)
    .update(runQuestions)
    .set({ answerJson: answer, answeredBy, answeredAt: new Date() })
    .where(
      and(
        eq(runQuestions.id, questionId),
        eq(runQuestions.runId, runId),
        isNull(runQuestions.answeredAt),
      ),
    )
    .returning({ id: runQuestions.id })
    .get();
  return Boolean(row);
}

export type RunOutcome =
  | { status: "released"; result: unknown }
  | { status: "gap_list"; gapList: unknown }
  // Log the error itself with `appendRunEvent`, as the agent assigns `seq`.
  | { status: "failed" | "cancelled" };

/**
 * Ends a run once: sets its final status and, for a result or gap list,
 * stores it in the same batch. False if the run had already ended.
 */
export async function finishRun(
  runId: string,
  outcome: RunOutcome,
): Promise<boolean> {
  const run = await getRun(runId);
  if (!run || run.finishedAt !== null) return false;
  const now = Date.now();
  if (outcome.status === "failed" || outcome.status === "cancelled") {
    const updated = await createDb(env.DB).update(runs).set({status: outcome.status, finishedAt: new Date(now)}).where(and(eq(runs.id,runId), isNull(runs.finishedAt))).returning({id:runs.id}).get();
    return Boolean(updated);
  }
  const output = parseRunOutput(outcome.status === "released" ? outcome.result : outcome.gapList);
  if (output.meta.run_id !== run.id || output.meta.mode !== run.mode ||
      output.meta.contract_version !== run.contractVersion ||
      output.meta.formula_version !== run.formulaVersion ||
      output.meta.settings_version !== run.settingsVersion ||
      (output.kind === "result" ? "released" : "gap_list") !== outcome.status)
    throw new Error("ENGINE_INTEGRITY: run metadata mismatch");
  const serialized = JSON.stringify(output);
  if (new TextEncoder().encode(serialized).length > 512 * 1024)
    throw new Error("ENGINE_INTEGRITY: output exceeds storage limit");
  const rows = await env.DB.batch([
    env.DB.prepare(`INSERT INTO run_results (run_id,result_json,gap_list_json,created_at)
      SELECT ?,?,?,? FROM runs WHERE id=? AND finished_at IS NULL`).bind(runId,output.kind === "result" ? serialized : null,output.kind === "gap_list" ? serialized : null,now,runId),
    env.DB.prepare(`UPDATE runs SET status=?,finished_at=? WHERE id=? AND finished_at IS NULL AND EXISTS (SELECT 1 FROM run_results WHERE run_id=?)`).bind(outcome.status,now,runId,runId),
  ]);
  return rows.every(row => row.meta.changes === 1);
}

export type LatestResult = {
  run: Run;
  result: unknown;
  gapList: unknown;
};

/**
 * The project's newest run that released a result or a gap list. Whether it
 * is a result or a gap list is read from `run.status`.
 */
export async function getLatestResult(
  projectId: string,
): Promise<LatestResult | null> {
  const row = await createDb(env.DB)
    .select({ run: runs, result: runResults })
    .from(runs)
    .innerJoin(runResults, eq(runResults.runId, runs.id))
    .where(
      and(
        eq(runs.projectId, projectId),
        inArray(runs.status, ["released", "gap_list"]),
      ),
    )
    .orderBy(desc(runs.finishedAt))
    .get();
  if (!row) return null;
  return {
    run: row.run,
    result: row.result.resultJson ?? null,
    gapList: row.result.gapListJson ?? null,
  };
}
