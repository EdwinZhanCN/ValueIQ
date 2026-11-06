/**
 * Types shared by every track (integration contract section 3). One
 * definition here; the agent, the workflow, the engine adapter, and the UI
 * import it. Type-only: this module has no runtime code.
 */
export type {
  FormFile,
  GapList,
  Input,
  Result,
  RunOutput,
} from "../engine/types";

export interface Question {
  id: string;
  run_id: string;
  text: string;
  why_blocking: string;
  affects: string[];
  options: ("value" | "use_proxy" | "exclude")[];
}

/** `blocked_on_question` is part of the contract but unused: ask_user is tabled. */
export type RunStatus =
  | "idle"
  | "preflight"
  | "running"
  | "blocked_on_question"
  | "released"
  | "gap_list"
  | "failed"
  | "cancelled";

/** Contract section 8, plus NOT_SUPPORTED for the tabled `answerQuestion`. */
export type RunErrorCode =
  | "ACCESS_DENIED"
  | "BAD_INPUT"
  | "FILE_UNREADABLE"
  | "MODEL_ERROR"
  | "MODEL_TIMEOUT"
  | "ENGINE_INTEGRITY"
  | "GATE_FAILED"
  | "QUESTION_TIMEOUT"
  | "CANCELLED"
  | "NOT_SUPPORTED";

export interface RunError {
  code: RunErrorCode;
  message: string;
  retryable: boolean;
}

export interface RunView {
  run_id: string | null;
  status: RunStatus;
  step: string | null;
  progress_pct: number;
  checklist: { label: string; state: "todo" | "doing" | "done" | "error" }[];
  pending_question: Question | null;
  error?: RunError;
  mode: "real" | "stub";
}
