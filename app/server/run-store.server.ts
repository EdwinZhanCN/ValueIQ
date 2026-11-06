/**
 * D1 implementation of the run store (integration contract sections 4 and 5).
 *
 * Every method re-checks that `userId` is a member of the project's team
 * before it touches a row, and every run-scoped method also checks that the run
 * belongs to the scoped project. Callers never receive the D1 handle.
 *
 * This module takes the D1 binding as an argument (no `cloudflare:workers`
 * import) so tests can run it on a SQLite-backed shim. `runs.server.ts` binds it
 * to `env.DB`.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { createDb } from "../../db/client";
import { member, projects, runEvents, runResults, runs } from "../../db/schema";
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
import type { RunError, RunStatus } from "../../shared/types";

export class RunAccessError extends Error {
  readonly code = "ACCESS_DENIED";
  constructor(message = "Access denied") {
    super(message);
    this.name = "RunAccessError";
  }
}

const ACTIVE: RunStatus[] = ["preflight", "running", "blocked_on_question"];
const iso = (d: Date) => d.toISOString();
const ms = (s: string) => new Date(s);

type Db = ReturnType<typeof createDb>;
type RunRow = typeof runs.$inferSelect;

export class D1RunStore implements RunStore {
  private readonly db: Db;

  constructor(
    d1: D1Database,
    /**
     * `userId: null` is the internal system scope, used only by the agent's own workflow
     * callbacks (no user is present); it skips the membership check but stays project-scoped.
     */
    private readonly scope: { projectId: string; userId: string | null },
  ) {
    this.db = createDb(d1);
  }

  /** The team-membership check for the scoped user and project. */
  async assertAccess(): Promise<void> {
    if (this.scope.userId === null) return;
    const row = await this.db
      .select({ role: member.role })
      .from(projects)
      .innerJoin(
        member,
        and(
          eq(member.organizationId, projects.teamId),
          eq(member.userId, this.scope.userId),
        ),
      )
      .where(eq(projects.id, this.scope.projectId))
      .get();
    if (!row) throw new RunAccessError();
  }

  private async ownRun(id: string): Promise<RunRow | null> {
    await this.assertAccess();
    const row = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.projectId, this.scope.projectId)))
      .get();
    return row ?? null;
  }

  private async toRecord(row: RunRow): Promise<RunRecord> {
    let error: RunError | null = null;
    if (row.status === "failed") {
      // No error column in the contract: the failure is the last error event.
      const ev = await this.db
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
      status: row.status,
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

  async createRun(r: NewRun): Promise<RunRecord> {
    await this.assertAccess();
    if (r.project_id !== this.scope.projectId)
      throw new RunAccessError("Run belongs to another project");
    if (r.started_by !== this.scope.userId)
      throw new RunAccessError("started_by must be the calling user");
    await this.db.insert(runs).values({
      id: r.id,
      projectId: r.project_id,
      status: "running",
      mode: r.mode,
      formHash: r.form_hash,
      contractVersion: r.contract_version,
      formulaVersion: r.formula_version,
      settingsVersion: r.settings_version,
      startedBy: r.started_by,
      startedAt: ms(r.started_at),
    });
    const row = await this.ownRun(r.id);
    if (!row) throw new Error(`run ${r.id} missing after insert`);
    return this.toRecord(row);
  }

  async getRun(id: string): Promise<RunRecord | null> {
    const row = await this.ownRun(id);
    return row ? this.toRecord(row) : null;
  }

  async findRunByFormHash(
    project_id: string,
    form_hash: string,
  ): Promise<RunRecord | null> {
    await this.assertAccess();
    if (project_id !== this.scope.projectId) return null;
    const row = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.projectId, project_id), eq(runs.formHash, form_hash)))
      .orderBy(desc(runs.startedAt), desc(runs.id))
      .get();
    return row ? this.toRecord(row) : null;
  }

  /** The newest run of the project, any form. */
  async latestRun(): Promise<RunRecord | null> {
    await this.assertAccess();
    const row = await this.db
      .select()
      .from(runs)
      .where(eq(runs.projectId, this.scope.projectId))
      .orderBy(desc(runs.startedAt), desc(runs.id))
      .get();
    return row ? this.toRecord(row) : null;
  }

  /** The newest released or gap-list run of the project with its stored output. */
  async latestResult(): Promise<{ run: RunRecord; output: RunOutput } | null> {
    await this.assertAccess();
    const row = await this.db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.projectId, this.scope.projectId),
          inArray(runs.status, ["released", "gap_list"]),
        ),
      )
      .orderBy(desc(runs.startedAt), desc(runs.id))
      .get();
    if (!row) return null;
    const res = await this.getResult(row.id);
    const json = res?.result_json ?? res?.gap_list_json;
    if (!json) return null;
    return {
      run: await this.toRecord(row),
      output: JSON.parse(json) as RunOutput,
    };
  }
  async updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, "status" | "finished_at" | "error">>,
  ): Promise<RunRecord> {
    const row = await this.ownRun(id);
    if (!row) throw new Error(`no run ${id}`);
    const set: Partial<typeof runs.$inferInsert> = {};
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.finished_at !== undefined)
      set.finishedAt = patch.finished_at ? ms(patch.finished_at) : null;
    if (Object.keys(set).length > 0)
      await this.db.update(runs).set(set).where(eq(runs.id, id));
    const next = await this.ownRun(id);
    if (!next) throw new Error(`no run ${id}`);
    return this.toRecord(next);
  }

  async appendRunEvent(e: RunEventRow): Promise<void> {
    if (!(await this.ownRun(e.run_id))) throw new Error(`no run ${e.run_id}`);
    // A duplicate (run_id, seq) is rejected by the primary key.
    await this.db.insert(runEvents).values({
      runId: e.run_id,
      seq: e.seq,
      step: e.step,
      type: e.type,
      payloadJson: JSON.parse(e.payload_json) as unknown,
      createdAt: ms(e.created_at),
    });
  }

  async listRunEvents(run_id: string): Promise<RunEventRow[]> {
    if (!(await this.ownRun(run_id))) return [];
    const rows = await this.db
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

  // run_questions is not built yet (ask_user is tabled).
  saveQuestion(_q: QuestionRow): Promise<void> {
    return Promise.reject(new Error("run_questions is not built"));
  }
  saveAnswer(
    _question_id: string,
    _answer_json: string,
    _answered_by: string,
    _answered_at: string,
  ): Promise<void> {
    return Promise.reject(new Error("run_questions is not built"));
  }

  async saveResult(
    run_id: string,
    out: RunOutput,
    created_at: string,
  ): Promise<ResultRow> {
    if (!(await this.ownRun(run_id))) throw new Error(`no run ${run_id}`);
    const problems = checkRunOutput(out);
    if (problems.length > 0)
      throw new Error(`invalid run output: ${problems.slice(0, 3).join("; ")}`);
    const isResult = out.kind === "result";
    // The table CHECK enforces exactly one column; a second save hits the PK.
    await this.db.insert(runResults).values({
      runId: run_id,
      resultJson: isResult ? out : null,
      gapListJson: isResult ? null : out,
      createdAt: ms(created_at),
    });
    const row = await this.getResult(run_id);
    if (!row) throw new Error(`result for ${run_id} missing after insert`);
    return row;
  }

  async getResult(run_id: string): Promise<ResultRow | null> {
    if (!(await this.ownRun(run_id))) return null;
    const r = await this.db
      .select()
      .from(runResults)
      .where(eq(runResults.runId, run_id))
      .get();
    if (!r) return null;
    return {
      run_id: r.runId,
      result_json: r.resultJson == null ? null : JSON.stringify(r.resultJson),
      gap_list_json:
        r.gapListJson == null ? null : JSON.stringify(r.gapListJson),
      created_at: iso(r.createdAt),
    };
  }

  async cancel(run_id: string, at: string): Promise<RunRecord | null> {
    const row = await this.ownRun(run_id);
    if (!row) return null;
    await this.db
      .update(runs)
      .set({ status: "cancelled", finishedAt: ms(at) })
      .where(and(eq(runs.id, run_id), inArray(runs.status, ACTIVE)));
    const next = await this.ownRun(run_id);
    return next ? this.toRecord(next) : null;
  }
}
