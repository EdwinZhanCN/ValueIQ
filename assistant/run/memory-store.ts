import type { LegacyFormFile, RunOutput } from "../../engine";
import type {
  NewRun,
  QuestionRow,
  ResultRow,
  RunEventRow,
  RunRecord,
  RunStore,
} from "./types";

const ACTIVE = new Set(["preflight", "running", "blocked_on_question"]);
const clone = <T>(x: T): T => structuredClone(x);

/** In-memory RunStore for tests. Enforces the same constraints the D1 tables will have. */
export class MemoryRunStore implements RunStore {
  readonly runs = new Map<string, RunRecord>();
  readonly events = new Map<string, RunEventRow[]>();
  readonly questions = new Map<string, QuestionRow>();
  readonly results = new Map<string, ResultRow>();
  readonly forms = new Map<string, LegacyFormFile>();

  createRun({ form, ...r }: NewRun): Promise<RunRecord> {
    if (this.runs.has(r.id))
      return Promise.reject(new Error(`run ${r.id} exists`));
    this.forms.set(r.id, clone(form));
    const rec: RunRecord = {
      ...r,
      status: "running",
      finished_at: null,
      error: null,
    };
    this.runs.set(r.id, rec);
    this.events.set(r.id, []);
    return Promise.resolve(clone(rec));
  }

  getRun(id: string): Promise<RunRecord | null> {
    const r = this.runs.get(id);
    return Promise.resolve(r ? clone(r) : null);
  }

  getRunForm(id: string): Promise<LegacyFormFile | null> {
    const f = this.forms.get(id);
    return Promise.resolve(f ? clone(f) : null);
  }

  findRunByFormHash(
    project_id: string,
    form_hash: string,
  ): Promise<RunRecord | null> {
    let found: RunRecord | null = null;
    for (const r of this.runs.values())
      if (r.project_id === project_id && r.form_hash === form_hash) found = r; // latest wins
    return Promise.resolve(found ? clone(found) : null);
  }

  updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, "status" | "finished_at" | "error">>,
  ): Promise<RunRecord> {
    const r = this.runs.get(id);
    if (!r) return Promise.reject(new Error(`no run ${id}`));
    Object.assign(r, patch);
    return Promise.resolve(clone(r));
  }

  appendRunEvent(e: RunEventRow): Promise<void> {
    const list = this.events.get(e.run_id);
    if (!list) return Promise.reject(new Error(`no run ${e.run_id}`));
    if (list.some((x) => x.seq === e.seq))
      return Promise.reject(
        new Error(`duplicate (run_id, seq) = (${e.run_id}, ${e.seq})`),
      );
    JSON.parse(e.payload_json); // must be valid JSON
    list.push(clone(e));
    return Promise.resolve();
  }

  listRunEvents(run_id: string): Promise<RunEventRow[]> {
    return Promise.resolve(
      clone([...(this.events.get(run_id) ?? [])].sort((a, b) => a.seq - b.seq)),
    );
  }

  saveQuestion(q: QuestionRow): Promise<void> {
    this.questions.set(q.id, clone(q));
    return Promise.resolve();
  }

  saveAnswer(
    question_id: string,
    answer_json: string,
    answered_by: string,
    answered_at: string,
  ): Promise<void> {
    const q = this.questions.get(question_id);
    if (!q) return Promise.reject(new Error(`no question ${question_id}`));
    q.answer_json = answer_json;
    q.answered_by = answered_by;
    q.answered_at = answered_at;
    return Promise.resolve();
  }

  saveResult(
    run_id: string,
    out: RunOutput,
    created_at: string,
  ): Promise<ResultRow> {
    if (!this.runs.has(run_id))
      return Promise.reject(new Error(`no run ${run_id}`));
    if (this.results.has(run_id))
      return Promise.reject(new Error(`result for ${run_id} already saved`));
    const row: ResultRow = {
      run_id,
      result_json: out.kind === "result" ? JSON.stringify(out) : null,
      gap_list_json: out.kind === "gap_list" ? JSON.stringify(out) : null,
      created_at,
    };
    if ((row.result_json === null) === (row.gap_list_json === null))
      return Promise.reject(
        new Error("exactly one of result_json and gap_list_json must be set"),
      );
    this.results.set(run_id, row);
    return Promise.resolve(clone(row));
  }

  getResult(run_id: string): Promise<ResultRow | null> {
    const r = this.results.get(run_id);
    return Promise.resolve(r ? clone(r) : null);
  }

  cancel(run_id: string, at: string): Promise<RunRecord | null> {
    const r = this.runs.get(run_id);
    if (!r) return Promise.resolve(null);
    if (ACTIVE.has(r.status)) {
      r.status = "cancelled";
      r.finished_at = at;
    }
    return Promise.resolve(clone(r));
  }
}
