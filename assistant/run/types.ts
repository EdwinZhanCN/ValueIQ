// Run types shared with the integration contract (section 3). blocked_on_question stays in the type
// for the contract but is NOT implemented: ask_user is tabled until after the demo.
import type { RunOutput } from "../../engine";
import type { RunError, RunStatus } from "../../shared/types";

export type {
  Question,
  RunError,
  RunStatus,
  RunView,
} from "../../shared/types";

export const CHECKLIST_LABELS = [
  "Files read",
  "Haircuts",
  "Drivers",
  "Project",
  "Scenarios",
  "Confidence",
  "Gate",
  "Narrative",
] as const;

/** Row shapes mirror the contract's section 4 tables (timestamps are ISO strings here). */
export interface RunRecord {
  id: string;
  project_id: string;
  status: RunStatus;
  mode: "real" | "stub";
  form_hash: string;
  contract_version: string;
  formula_version: string;
  settings_version: string;
  started_by: string;
  started_at: string;
  finished_at: string | null;
  error: RunError | null;
}
export interface NewRun {
  id: string;
  project_id: string;
  mode: "real" | "stub";
  form_hash: string;
  contract_version: string;
  formula_version: string;
  settings_version: string;
  started_by: string;
  started_at: string;
}
export interface RunEventRow {
  run_id: string;
  seq: number;
  step: string | null;
  type: string;
  payload_json: string; // ids and hashes only
  created_at: string;
}
export interface QuestionRow {
  id: string;
  run_id: string;
  payload_json: string;
  answer_json: string | null;
  answered_by: string | null;
  asked_at: string;
  answered_at: string | null;
}
export interface ResultRow {
  run_id: string;
  result_json: string | null; // exactly one of the two is set
  gap_list_json: string | null;
  created_at: string;
}

/**
 * Persistence the orchestrator needs. A D1 implementation maps these 1:1 onto the runs, run_events,
 * run_questions and run_results tables of the integration contract.
 */
export interface RunStore {
  createRun(r: NewRun): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  findRunByFormHash(
    project_id: string,
    form_hash: string,
  ): Promise<RunRecord | null>;
  updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, "status" | "finished_at" | "error">>,
  ): Promise<RunRecord>;
  /** The caller assigns seq (contract: "the agent assigns seq"); a duplicate (run_id, seq) is rejected. */
  appendRunEvent(e: RunEventRow): Promise<void>;
  listRunEvents(run_id: string): Promise<RunEventRow[]>;
  saveQuestion(q: QuestionRow): Promise<void>;
  saveAnswer(
    question_id: string,
    answer_json: string,
    answered_by: string,
    answered_at: string,
  ): Promise<void>;
  /** Stores a result as result_json or a gap list as gap_list_json: exactly one. */
  saveResult(
    run_id: string,
    out: RunOutput,
    created_at: string,
  ): Promise<ResultRow>;
  getResult(run_id: string): Promise<ResultRow | null>;
  /** Ends an active run as cancelled; a no-op for runs that already finished. */
  cancel(run_id: string, at: string): Promise<RunRecord | null>;
}
