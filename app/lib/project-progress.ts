/**
 * Where a project stands, from facts the server already has: whether goals
 * are chosen, whether the saved form validates, the latest finished run and
 * whether that run has a PDF report. Pure, so the project step bar and the
 * project list compute it the same way.
 */
import type { StepKey, StepState } from "../components/project/project-steps";

export type ProjectStatus = "in_progress" | "needs_review" | "complete";

export interface ProgressFacts {
  /** At least one goal chosen on Intake. */
  hasGoals: boolean;
  /** The saved form passes `validateFormFile` for this project's files. */
  complete: boolean;
  /** The latest run that ended with a result or a gap list. */
  latest: { status: "released" | "gap_list"; hasReport: boolean } | null;
  /** A run is being calculated right now. */
  processing: boolean;
}

export const STEP_ORDER: StepKey[] = [
  "intake",
  "clarify",
  "process",
  "review",
  "report",
];

export const STEP_LABELS: Record<StepKey, string> = {
  intake: "Intake",
  clarify: "Clarify",
  process: "Process",
  review: "Review",
  report: "Report",
};

/** The done/todo state of each step in the project step bar. */
export function stepStates(f: ProgressFacts): Record<StepKey, StepState> {
  const released = f.latest?.status === "released";
  return {
    intake: f.hasGoals ? "done" : "todo",
    clarify: f.complete ? "done" : "todo",
    process: f.latest ? "done" : "todo",
    review: released ? "done" : "todo",
    report: released && f.latest?.hasReport ? "done" : "todo",
  };
}

/**
 * The project list's status tabs (mock UI 02):
 * - complete: the latest finished run released a result that has a PDF report;
 * - needs_review: the latest run finished (result or gap list), no report yet;
 * - in_progress: no run has finished yet.
 */
export function projectStatus(f: ProgressFacts): ProjectStatus {
  if (!f.latest) return "in_progress";
  if (f.latest.status === "released" && f.latest.hasReport) return "complete";
  return "needs_review";
}

/**
 * The step a project is at, as "Clarify · 2 / 5": Review once a run has
 * finished, Report once it is complete, otherwise the first unfinished step
 * of Intake, Clarify and Process.
 */
export function currentStep(f: ProgressFacts): {
  key: StepKey;
  label: string;
  position: number;
} {
  const status = projectStatus(f);
  const states = stepStates(f);
  const key: StepKey =
    status === "complete"
      ? "report"
      : status === "needs_review"
        ? "review"
        : (STEP_ORDER.slice(0, 3).find((step) => states[step] === "todo") ??
          "process");
  return {
    key,
    label: STEP_LABELS[key],
    position: STEP_ORDER.indexOf(key) + 1,
  };
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  in_progress: "In progress",
  needs_review: "Needs review",
  complete: "Complete",
};

export const STATUS_FILTERS = [
  "all",
  "in_progress",
  "needs_review",
  "complete",
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** `?status=` as a filter; anything unknown shows all projects. */
export function parseStatusFilter(value: string | null): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as StatusFilter)
    : "all";
}
