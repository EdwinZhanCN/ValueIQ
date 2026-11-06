/**
 * The orchestrator's `RunStore`, written against Zihao's run server API in
 * `runs.server.ts` (integration contract sections 4 and 5). Nothing here owns
 * a table: writes go through `createRun`, `updateRunStatus`, `appendRunEvent`,
 * `finishRun` and `getRun`.
 *
 * Two reads have no function in `runs.server.ts` yet (listing `run_events` for
 * the next `seq` and the last error, and the newest run for a form hash), so
 * they are read-only queries here. Every method re-checks team membership
 * with `getProjectMembership` and that the run belongs to the scoped project.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { runEvents, runs } from "../../db/schema";
import { checkRunOutput } from "../../engine/schema";
import type { RunOutput } from "../../engine/types";
import type {
  NewRun,
  QuestionRow,
  ResultRow,
  RunEventRow,
  RunRecord,
  RunStore,
} from "../../assistant/run/types";
import type { RunError } from "../../shared/types";
import { getProjectMembership } from "./access.server";
import {
  appendRunEvent,
  createRun,
  finishRun,
  getLatestResult,
  getRun,
  updateRunStatus,
  type Run,
} from "./runs.server";

export class RunAccessError extends Error {
  readonly code = "ACCESS_DENIED";
  constructor(message = "Access denied") {
    super(message);
    this.name = "RunAccessError";
  }
}

const iso = (d: Date) => d.toISOString();

export class D1RunStore implements RunStore {
  /** Outputs saved but not yet released: `finishRun` stores status and output together. */
  private readonly pending = new Map<string, RunOutput>();
  /**
   * When set (the workflow does), `updateRun(failed)` is held back so a retried
   * step can run the same run again; `finalizeFailed` ends it for real.
   */
  deferFailure = false;

  constructor(
    /** `userId: null` is the system scope (agent callbacks): no membership check. */
    private readonly scope: { projectId: string; userId: string | null },
  ) {}

  async assertAccess(): Promise<void> {
    if (this.scope.userId === null) return;
    const m = await getProjectMembership(
      this.scope.projectId,
      this.scope.userId,
    );
    if (!m) throw new RunAccessError();
  }

  private async own(id: string): Promise<Run | null> {
    await this.assertAccess();
    const row = await getRun(id);
    return row && row.projectId === this.scope.projectId ? row : null;
  }

  private async toRecord(row: Run): Promise<RunRecord> {
    let error: RunError | null = null;
    if (row.status === "failed") {
      const ev = await createDb(env.DB)
        .select({ payload: runEvents.payloadJson })
        .from(runEvents)
        .where(and(eq(runEvents.runId, row.id), eq(runEvents.type, "error")))
        .orderBy(desc(runEvents.seq))
        .get();
      const p = (ev?.payload ?? {}) as Partial<RunError>;
      error = {
        code: p.code ?? "MODEL_ERROR",
        message: p.message ?? "The run failed",
        retryable: p.retryable ?? false,
      };
    }
    return {
      id: row.id,
      project_id: row.projectId,
      status: row.status as RunRecord["status"],
      mode: row.mode,
      form_hash: row.formHash,
      contract_version: row.contractVersion,
      formula_version: row.formulaVersion,
      settings_version: row.settingsVersion,
      started_by: row.startedBy,
      started_at: iso(row.startedAt),
      finished_at: row.finishedAt ? iso(row.finishedAt) : null,
      error,
    };
  }

  private async mustRecord(id: string): Promise<RunRecord> {
    const row = await this.own(id);
    if (!row) throw new Error(`no run ${id}`);
    return this.toRecord(row);
  }

  async createRun(r: NewRun): Promise<RunRecord> {
    await this.assertAccess();
    if (r.project_id !== this.scope.projectId)
      throw new RunAccessError("Run belongs to another project");
    if (r.started_by !== this.scope.userId)
      throw new RunAccessError("started_by must be the calling user");
    const row = await createRun({
      id: r.id,
      projectId: r.project_id,
      mode: r.mode,
      formHash: r.form_hash,
      contractVersion: r.contract_version,
      formulaVersion: r.formula_version,
      settingsVersion: r.settings_version,
      startedBy: r.started_by,
      status: "running",
    });
    return this.toRecord(row);
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const row = await this.own(id);
    return row ? this.toRecord(row) : null;
  }

  async findRunByFormHash(
    project_id: string,
    form_hash: string,
  ): Promise<RunRecord | null> {
    await this.assertAccess();
    if (project_id !== this.scope.projectId) return null;
    const row = await createDb(env.DB)
      .select()
      .from(runs)
      .where(and(eq(runs.projectId, project_id), eq(runs.formHash, form_hash)))
      .orderBy(desc(runs.startedAt), desc(runs.id))
      .get();
    return row ? this.toRecord(row) : null;
  }

  async latestResult(): Promise<{ run: RunRecord; output: RunOutput } | null> {
    await this.assertAccess();
    const latest = await getLatestResult(this.scope.projectId);
    const output = latest?.result ?? latest?.gapList;
    if (!latest || !output) return null;
    return {
      run: await this.toRecord(latest.run),
      output: output as RunOutput,
    };
  }

  async updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, "status" | "finished_at" | "error">>,
  ): Promise<RunRecord> {
    const row = await this.own(id);
    if (!row) throw new Error(`no run ${id}`);
    const status = patch.status;
    const ended = row.finishedAt !== null;
    if (
      status === "preflight" ||
      status === "running" ||
      status === "blocked_on_question"
    ) {
      // His API cannot reopen an ended run; the workflow defers failure instead.
      if (!ended) await updateRunStatus(id, status);
    } else if (status === "released" || status === "gap_list") {
      const out = this.pending.get(id);
      if (!ended && out) {
        await finishRun(
          id,
          status === "released"
            ? { status, result: out }
            : { status, gapList: out },
        );
        this.pending.delete(id);
      }
    } else if (status === "failed") {
      if (!ended && !this.deferFailure) await finishRun(id, { status });
    } else if (status === "cancelled") {
      if (!ended) await finishRun(id, { status });
    }
    return this.mustRecord(id);
  }

  /** Ends a deferred failure for good (final attempt or a non-retryable error). */
  async finalizeFailed(id: string): Promise<void> {
    if (await this.own(id)) await finishRun(id, { status: "failed" });
  }

  async appendRunEvent(e: RunEventRow): Promise<void> {
    if (!(await this.own(e.run_id))) throw new Error(`no run ${e.run_id}`);
    await appendRunEvent(e.run_id, {
      seq: e.seq,
      step: e.step,
      type: e.type,
      payload: JSON.parse(e.payload_json) as unknown,
    });
  }

  async listRunEvents(run_id: string): Promise<RunEventRow[]> {
    if (!(await this.own(run_id))) return [];
    const rows = await createDb(env.DB)
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, run_id))
      .orderBy(asc(runEvents.seq))
      .all();
    return rows.map((r) => ({
      run_id: r.runId,
      seq: r.seq,
      step: r.step,
      type: r.type,
      payload_json: JSON.stringify(r.payloadJson),
      created_at: iso(r.createdAt),
    }));
  }

  // ask_user is tabled: the question functions of runs.server.ts stay unused.
  saveQuestion(_q: QuestionRow): Promise<void> {
    return Promise.reject(new Error("NOT_SUPPORTED: ask_user is tabled"));
  }
  saveAnswer(): Promise<void> {
    return Promise.reject(new Error("NOT_SUPPORTED: ask_user is tabled"));
  }

  saveResult(
    run_id: string,
    out: RunOutput,
    created_at: string,
  ): Promise<ResultRow> {
    return this.own(run_id).then((row) => {
      if (!row) throw new Error(`no run ${run_id}`);
      const problems = checkRunOutput(out);
      if (problems.length > 0)
        throw new Error(
          `invalid run output: ${problems.slice(0, 3).join("; ")}`,
        );
      this.pending.set(run_id, out);
      return this.rowOf(run_id, out, created_at);
    });
  }

  private rowOf(run_id: string, out: RunOutput, at: string): ResultRow {
    const json = JSON.stringify(out);
    return {
      run_id,
      result_json: out.kind === "result" ? json : null,
      gap_list_json: out.kind === "result" ? null : json,
      created_at: at,
    };
  }

  async getResult(run_id: string): Promise<ResultRow | null> {
    const row = await this.own(run_id);
    if (!row) return null;
    let out = this.pending.get(run_id) ?? null;
    if (!out) {
      const l = await getLatestResult(this.scope.projectId);
      if (l && l.run.id === run_id)
        out = (l.result ?? l.gapList) as RunOutput | null;
    }
    return out
      ? this.rowOf(run_id, out, iso(row.finishedAt ?? row.startedAt))
      : null;
  }

  async cancel(run_id: string, _at: string): Promise<RunRecord | null> {
    if (!(await this.own(run_id))) return null;
    await finishRun(run_id, { status: "cancelled" });
    return this.getRun(run_id);
  }
}
