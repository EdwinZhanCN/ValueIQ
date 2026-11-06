/**
 * Shared types every track imports (integration contract, section 3).
 *
 * Change one only through a pull request to
 * `.agents/exec-plans/active/integration-contract.md` that each affected
 * owner acknowledges. No `any` across track boundaries.
 *
 * `FormFile` is the Input team's (Ag1) and `Result` / `GapList` are the
 * engine's; they are added here, or re-exported, when those contracts land.
 */

/** Run states (contract section 2). `idle` means no run yet. */
export const RUN_STATUSES = [
  "idle",
  "preflight",
  "running",
  "blocked_on_question",
  "released",
  "gap_list",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** A stored run is never `idle`. */
export type StoredRunStatus = Exclude<RunStatus, "idle">;

/** States a run ends in. */
export const FINAL_RUN_STATUSES = [
  "released",
  "gap_list",
  "failed",
  "cancelled",
] as const satisfies readonly StoredRunStatus[];
export type FinalRunStatus = (typeof FINAL_RUN_STATUSES)[number];

/** A stub run must say so in its data and show a STUB label in the UI. */
export const RUN_MODES = ["real", "stub"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export interface Question {
  id: string;
  run_id: string;
  text: string;
  why_blocking: string;
  affects: string[];
  options: ("value" | "use_proxy" | "exclude")[];
}

export interface RunError {
  code: string;
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
  mode: RunMode;
}
