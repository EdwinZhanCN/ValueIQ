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

/**
 * Clarify assistant (item 7). A reply is advice only: nothing in it changes
 * the form until the user accepts a card or proposal in the browser.
 */
export interface AssistantCard {
  id: string;
  /** defaults: labeled defaults to accept; missing: one input still needed; evidence: a checked quote. */
  kind: "defaults" | "missing" | "evidence";
  /** Written by code, never by the model, and never with digits. */
  title: string;
  /** Input ids, at most four. */
  fields: string[];
  options: ("value" | "not_sure" | "use_default" | "quote")[];
  evidence?: {
    input_id: string;
    file_id: string;
    quote: string;
    location: string;
  };
}

/** A value the user stated in their message, waiting for them to accept it. */
export interface AssistantProposal {
  id: string;
  input_id: string;
  value: number;
  /** The figure exactly as the user wrote it. */
  said: string;
  tier: "measured" | "documented" | "estimate";
}

/** A value the Clarify agent wrote into the form itself. Code, never the model, chose the tier and origin. */
export interface AppliedInput {
  input_id: string;
  value: number | string | number[];
  tier: "documented" | "benchmark" | "estimate";
  origin: "file" | "default" | "user" | "assistant_estimate";
  basis: "file_quote" | "proxy" | "user_said" | "reasoning";
  confidence: number;
  rationale: string;
  backing?: { source_file_id: string; quote: string; quote_confirmed: false };
}

export interface AssistantReply {
  text: string;
  /** "engine" when the model's text failed the number check and a fixed text was used. */
  source: "model" | "engine";
  mode: RunMode;
  cards: AssistantCard[];
  proposals: AssistantProposal[];
  /** Values the agent applied itself, each labeled by what it rests on. */
  applied?: AppliedInput[];
  /** Code-written notices, for example a file that contains instructions. */
  notices: string[];
}

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}
