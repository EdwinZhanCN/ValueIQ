/**
 * Pure helpers for the "Run assessment" UI (tasks L1-L3).
 *
 * Everything here maps data to display state or text; nothing touches the
 * network, the DOM, or React, so it is unit-tested directly
 * (`app/server/tests/run-ui.test.ts`). The UI never recomputes a number: it
 * formats what the engine saved (currency 2 decimals, percent 1 decimal,
 * half-up) through the engine's own `present` helpers.
 */
import { formatMoney, formatPct } from "../../engine/present";
import type { FormIssue } from "../../shared/form";
import type { RunError, RunStatus, RunView } from "../../shared/types";
import { GOAL_LABELS, LABELS } from "./intake-fields";

// ---------- connection ----------

/**
 * `connecting`: the first socket has not opened yet. `reconnecting`: it
 * dropped and the SDK is retrying. `denied`: the server closed it for good
 * (the agent closes 4401 when the access gate header is missing).
 */
export type ConnectionState = "connecting" | "open" | "reconnecting" | "denied";

export function connectionNote(state: ConnectionState): string | null {
  switch (state) {
    case "open":
      return null;
    case "connecting":
      return "Connecting to the assessment service...";
    case "reconnecting":
      return "Connection lost. Reconnecting... Your progress is saved on the server.";
    case "denied":
      return "You do not have access to this project's assessment. Reload the page or sign in again.";
  }
}

// ---------- run view ----------

/** Shown until the agent's first state message arrives. */
export const EMPTY_VIEW: RunView = {
  run_id: null,
  status: "idle",
  step: null,
  progress_pct: 0,
  checklist: [],
  pending_question: null,
  mode: "real",
};

export type StepState = RunView["checklist"][number]["state"];

export const STEP_STATE_TEXT: Record<StepState, string> = {
  todo: "Waiting",
  doing: "In progress",
  done: "Done",
  error: "Failed",
};

export type StepItem = { label: string; state: StepState; text: string };

export function checklistItems(view: RunView): StepItem[] {
  return view.checklist.map((c) => ({
    label: c.label,
    state: c.state,
    text: STEP_STATE_TEXT[c.state],
  }));
}

/**
 * The Process screen's short step list (mock UI 05). Each row stands for the
 * orchestrator checklist labels it groups, and its state is derived from
 * theirs only: nothing here advances on a timer. A label the orchestrator
 * reports that no row claims is shown as its own row, so a renamed or new step
 * is never hidden.
 */
export const PHASES: readonly { label: string; members: readonly string[] }[] =
  [
    { label: "Reading files and data", members: ["Files read"] },
    {
      label: "Calculating ROI",
      members: ["Haircuts", "Drivers", "Project", "Scenarios"],
    },
    { label: "Checking confidence", members: ["Confidence", "Gate"] },
    { label: "Writing the summary", members: ["Narrative"] },
  ];

export type PhaseItem = StepItem & {
  /** Reported checklist steps behind this row, and how many of them are done. */
  total: number;
  done: number;
};

function groupState(states: StepState[]): StepState {
  if (states.includes("error")) return "error";
  if (states.every((s) => s === "done")) return "done";
  if (states.includes("doing") || states.includes("done")) return "doing";
  return "todo";
}

export function phaseItems(view: RunView): PhaseItem[] {
  const out: (PhaseItem & { states: StepState[] })[] = [];
  const byPhase = new Map<string, PhaseItem & { states: StepState[] }>();
  for (const c of view.checklist) {
    const phase = PHASES.find((p) => p.members.includes(c.label));
    const key = phase?.label ?? `step:${c.label}`;
    let row = byPhase.get(key);
    if (!row) {
      row = {
        label: phase?.label ?? c.label,
        state: "todo",
        text: "",
        total: 0,
        done: 0,
        states: [],
      };
      byPhase.set(key, row);
      out.push(row);
    }
    row.states.push(c.state);
    row.total += 1;
    if (c.state === "done") row.done += 1;
  }
  return out.map(({ states, ...row }) => {
    const state = groupState(states);
    return { ...row, state, text: STEP_STATE_TEXT[state] };
  });
}

/** Percent for a progress bar: whole number, clamped to 0-100, NaN counts as 0. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export const ACTIVE_STATUSES: readonly RunStatus[] = [
  "preflight",
  "running",
  "blocked_on_question",
];

export function isActive(status: RunStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export type Tone = "neutral" | "active" | "success" | "attention" | "error";

export interface RunHeading {
  title: string;
  detail: string | null;
  tone: Tone;
}

/** The heading of the run panel for a view. `step` is the orchestrator's own label. */
export function runHeading(view: RunView): RunHeading {
  const step = view.step;
  switch (view.status) {
    case "idle":
      return {
        title:
          step === "Pre-flight done"
            ? "Readiness check finished"
            : "Ready to run",
        detail: null,
        tone: "neutral",
      };
    case "preflight":
      return { title: "Checking readiness", detail: step, tone: "active" };
    case "running":
      return {
        title: "Building your decision model",
        detail: step,
        tone: "active",
      };
    case "blocked_on_question":
      return {
        title: "The run is waiting on a question",
        detail: "Mid-run questions are not supported yet.",
        tone: "attention",
      };
    case "released":
      return { title: "Result ready", detail: null, tone: "success" };
    case "gap_list":
      return { title: "More evidence needed", detail: null, tone: "attention" };
    case "failed":
      return { title: "The run did not finish", detail: null, tone: "error" };
    case "cancelled":
      return { title: "Run cancelled", detail: null, tone: "neutral" };
  }
}

// ---------- buttons ----------

export interface RunControls {
  start: { show: boolean; enabled: boolean; label: string };
  cancel: { show: boolean; enabled: boolean };
  retry: { show: boolean; enabled: boolean };
  preflight: { show: boolean; enabled: boolean };
  /** Why the main action is unavailable, or null. Shown next to the buttons. */
  reason: string | null;
}

export const NO_FORM_REASON =
  "Save the intake form first. A run reads the saved form, and none has been saved yet.";

export function runControls(args: {
  view: RunView;
  connection: ConnectionState;
  hasForm: boolean;
  /** A start, retry or readiness call is in flight. */
  busy: boolean;
  /** A cancel call is in flight. */
  cancelling?: boolean;
}): RunControls {
  const { view, connection, hasForm, busy, cancelling = false } = args;
  const active = isActive(view.status);
  const connected = connection === "open";
  const retryable = view.status === "failed" && view.error?.retryable === true;

  let reason: string | null = null;
  if (!hasForm) reason = NO_FORM_REASON;
  else if (!connected && !active) reason = connectionNote(connection);

  const canAct = connected && !busy;
  const canStart = canAct && hasForm;

  let label = "Start run";
  if (view.status === "failed") label = "Start new run";
  else if (
    view.status === "released" ||
    view.status === "gap_list" ||
    view.status === "cancelled"
  )
    label = "Run again";

  return {
    start: { show: !active && !retryable, enabled: canStart, label },
    cancel: { show: active, enabled: connected && !cancelling },
    retry: { show: retryable, enabled: canStart },
    preflight: { show: !active, enabled: canStart },
    reason,
  };
}

/** Plain-language text for a failed call (`{ok:false, error}` from an agent method). */
export function callErrorText(error: RunError): string {
  switch (error.code) {
    case "ACCESS_DENIED":
      return "You no longer have access to this project. Reload the page or sign in again.";
    case "BAD_INPUT":
      return error.message === "No form has been saved yet"
        ? NO_FORM_REASON
        : error.message;
    default:
      return error.message;
  }
}

// ---------- Process screen (mock UI 05) ----------

export interface MissingInput {
  field: string;
  label: string;
  message: string;
}

function fieldLabel(field: string): string {
  if (field === "$") return "Saved form";
  const [head, goal] = field.split(".");
  if (head === "measurement_plan" && goal)
    return `Measurement plan: ${GOAL_LABELS[goal as keyof typeof GOAL_LABELS] ?? goal}`;
  if (LABELS[field]) return LABELS[field];
  const words = field.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What blocks a run, from the strict form validator's issues: one row per
 * field, in the validator's order, with its first message.
 */
export function missingInputs(issues: readonly FormIssue[]): MissingInput[] {
  const seen = new Map<string, MissingInput>();
  for (const issue of issues)
    if (!seen.has(issue.field))
      seen.set(issue.field, {
        field: issue.field,
        label: fieldLabel(issue.field),
        message: issue.message,
      });
  return [...seen.values()];
}

/**
 * The view the Process screen shows. The agent's own state wins; when it is
 * idle but the project has a saved outcome (for example before the socket
 * opens), that finished run is shown instead, as finished.
 */
export function shownView(
  view: RunView,
  latest: LatestOutcome | null,
): RunView {
  if (view.status !== "idle" || !latest) return view;
  return {
    ...view,
    run_id: latest.runId,
    status: latest.status,
    step: null,
    progress_pct: 100,
    checklist: view.checklist.map((c) => ({ ...c, state: "done" as const })),
    mode: latest.summary?.stub ? "stub" : view.mode,
  };
}

/** The one primary button of the Process card. */
export type ProcessAction =
  | { kind: "start"; label: string; enabled: boolean }
  | { kind: "fix"; label: string; href: string }
  | { kind: "results"; label: string; href: string }
  | { kind: "waiting"; label: string }
  | { kind: "cancel"; label: string; enabled: boolean };

export function processAction(args: {
  projectId: string;
  view: RunView;
  connection: ConnectionState;
  hasForm: boolean;
  /** Fields the strict validator rejects; a run starts only when this is empty. */
  missing: readonly MissingInput[];
  busy: boolean;
  cancelling?: boolean;
}): ProcessAction {
  const { projectId, view, connection, hasForm, missing, busy } = args;
  const connected = connection === "open";
  if (view.status === "blocked_on_question")
    return {
      kind: "cancel",
      label: "Cancel run",
      enabled: connected && !args.cancelling,
    };
  if (isActive(view.status)) return { kind: "waiting", label: "View results" };
  if ((view.status === "released" || view.status === "gap_list") && view.run_id)
    return {
      kind: "results",
      label: view.status === "released" ? "View results" : "See what to add",
      href: resultsHref(projectId, view.run_id),
    };
  if (!hasForm)
    return {
      kind: "fix",
      label: "Go to Intake",
      href: `/projects/${projectId}`,
    };
  if (missing.length > 0)
    return {
      kind: "fix",
      label: "Go to Clarify",
      href: clarifyHref(projectId),
    };
  const label =
    view.status === "failed"
      ? view.error?.retryable
        ? "Retry"
        : "Start new run"
      : view.status === "cancelled"
        ? "Run again"
        : "Start run";
  return { kind: "start", label, enabled: connected && !busy };
}

/** A finished run whose inputs were saved again since: offer a fresh run. */
export function canRerun(args: {
  view: RunView;
  latest: LatestOutcome | null;
  hasForm: boolean;
  missing: readonly MissingInput[];
}): boolean {
  const { view, latest, hasForm, missing } = args;
  return (
    (view.status === "released" || view.status === "gap_list") &&
    latest?.runId === view.run_id &&
    latest.formChangedSince &&
    hasForm &&
    missing.length === 0
  );
}

export function clarifyHref(projectId: string): string {
  return `/projects/${projectId}/clarify`;
}

// ---------- numbers (format only) ----------

const NOT_AVAILABLE = "Not available";

export function money(
  value: number | null | undefined,
  currency: string,
): string {
  return typeof value === "number" && Number.isFinite(value)
    ? formatMoney(value, currency)
    : NOT_AVAILABLE;
}

export function percent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? formatPct(value)
    : NOT_AVAILABLE;
}

/** A 0-1 share (confidence, floor) shown as a percent. Formatting only. */
export function share(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? formatPct(value * 100)
    : NOT_AVAILABLE;
}

/** "2026-11-05T12:00:00Z" -> "2026-11-05 12:00 UTC", same style as the form's saved stamp. */
export function utcStamp(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

// ---------- saved outcome ----------

export interface HeadlineCell {
  text: string;
  /** Why the value is missing (from `headline.null_reasons`), else null. */
  reason: string | null;
}
export interface HeadlineRow {
  key: "npv" | "roi_undiscounted" | "roi_pv" | "payback";
  label: string;
  capacity: HeadlineCell;
  hard: HeadlineCell;
}
export interface ResultSummary {
  kind: "result";
  runId: string;
  stub: boolean;
  label: string;
  currency: string;
  assumptions: string;
  generatedAt: string;
  rows: HeadlineRow[];
  bandNote: string | null;
}
export interface GapItemSummary {
  rank: number;
  label: string;
  whatToAdd: string;
  confidenceNow: string;
  confidenceIfAdded: string;
  inputId: string | null;
}
export interface GapSummary {
  kind: "gap_list";
  runId: string;
  stub: boolean;
  label: string;
  reason: string;
  confidence: string;
  floor: string;
  items: GapItemSummary[];
  generatedAt: string;
}
export type OutcomeSummary = ResultSummary | GapSummary;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The stored column may arrive as an object or, defensively, as a JSON string. */
function asObject(stored: unknown): Obj | null {
  if (typeof stored === "string") {
    try {
      const parsed: unknown = JSON.parse(stored);
      return isObj(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isObj(stored) ? stored : null;
}

function cell(
  value: number | null,
  fmt: (n: number | null) => string,
  nullReasons: Obj,
  reasonKey: string,
): HeadlineCell {
  if (value !== null) return { text: fmt(value), reason: null };
  const reason = nullReasons[reasonKey];
  return {
    text: NOT_AVAILABLE,
    reason:
      typeof reason === "string" && reason !== ""
        ? reason
        : "No reason was recorded for this figure.",
  };
}

function paybackCell(p: unknown): HeadlineCell {
  const text = isObj(p) ? str(p.text) : "";
  return { text: text !== "" ? text : NOT_AVAILABLE, reason: null };
}

/**
 * Reads the saved `RunOutput` (the engine's result or gap list) into display
 * text. Returns null when it is not a readable output; the caller then says so
 * and never invents a figure. A null number stays "Not available" with the
 * engine's reason, never 0.
 */
export function summarizeOutput(stored: unknown): OutcomeSummary | null {
  const out = asObject(stored);
  if (!out || !isObj(out.meta)) return null;
  const meta = out.meta;
  const base = {
    runId: str(meta.run_id),
    stub: meta.mode === "stub",
    label: str(meta.label, "Pre-funding estimate"),
    generatedAt: str(meta.generated_at),
  };

  if (out.kind === "gap_list") {
    const gap = out.gap_list;
    if (!isObj(gap) || !Array.isArray(gap.items)) return null;
    const items: GapItemSummary[] = [];
    for (const raw of gap.items as unknown[]) {
      if (!isObj(raw)) continue;
      const back = raw.return_to;
      items.push({
        rank: typeof raw.rank === "number" ? raw.rank : items.length + 1,
        label: str(raw.label, str(raw.target)),
        whatToAdd: str(raw.what_to_add),
        confidenceNow: share(numOrNull(raw.confidence_now)),
        confidenceIfAdded: share(numOrNull(raw.confidence_if_added)),
        inputId:
          isObj(back) && typeof back.input_id === "string"
            ? back.input_id
            : null,
      });
    }
    items.sort((a, b) => a.rank - b.rank);
    return {
      kind: "gap_list",
      ...base,
      reason: str(gap.reason, "Not enough backed evidence to give a result"),
      confidence: share(numOrNull(gap.project_confidence)),
      floor: share(numOrNull(gap.project_floor)),
      items,
    };
  }

  if (out.kind === "result") {
    const result = out.result;
    if (!isObj(result) || !isObj(result.headline)) return null;
    const h = result.headline;
    const currency = str(meta.currency);
    const reasons = isObj(h.null_reasons) ? h.null_reasons : {};
    const npv = isObj(h.npv) ? h.npv : {};
    const roi = isObj(h.roi) ? h.roi : {};
    const undiscounted = isObj(roi.undiscounted) ? roi.undiscounted : {};
    const pv = isObj(roi.pv) ? roi.pv : {};
    const payback = isObj(h.payback) ? h.payback : {};
    const m = (n: number | null) => money(n, currency);
    const rows: HeadlineRow[] = [
      {
        key: "npv",
        label: "NPV",
        capacity: cell(
          numOrNull(npv.capacity_inclusive),
          m,
          reasons,
          "npv.capacity_inclusive",
        ),
        hard: cell(numOrNull(npv.hard), m, reasons, "npv.hard"),
      },
      {
        key: "roi_undiscounted",
        label: "ROI, undiscounted",
        capacity: cell(
          numOrNull(undiscounted.capacity_inclusive),
          percent,
          reasons,
          "roi.undiscounted.capacity_inclusive",
        ),
        hard: cell(
          numOrNull(undiscounted.hard),
          percent,
          reasons,
          "roi.undiscounted.hard",
        ),
      },
      {
        key: "roi_pv",
        label: "ROI, NPV over PV of costs",
        capacity: cell(
          numOrNull(pv.capacity_inclusive),
          percent,
          reasons,
          "roi.pv.capacity_inclusive",
        ),
        hard: cell(numOrNull(pv.hard), percent, reasons, "roi.pv.hard"),
      },
      {
        key: "payback",
        label: "Payback",
        capacity: paybackCell(payback.capacity_inclusive),
        hard: paybackCell(payback.hard),
      },
    ];
    const horizon = numOrNull(meta.horizon_years);
    const rate = numOrNull(meta.discount_rate_pct);
    const parts: string[] = [];
    if (currency) parts.push(currency);
    if (horizon !== null) parts.push(`${horizon}-year horizon`);
    if (rate !== null) parts.push(`${formatPct(rate)} discount rate`);
    const confidence = isObj(result.confidence) ? result.confidence : {};
    const band = str(confidence.band_note);
    return {
      kind: "result",
      ...base,
      currency,
      assumptions: parts.join(", "),
      rows,
      bandNote: band !== "" ? band : null,
    };
  }
  return null;
}

export type LatestOutcome = {
  runId: string;
  status: "released" | "gap_list";
  finishedAt: string | null;
  /** The form was saved after this run ended, so the outcome may be out of date. */
  formChangedSince: boolean;
  /** Null when the stored output could not be read. */
  summary: OutcomeSummary | null;
};

// ---------- links ----------

/** The Review step for one run. */
export function resultsHref(projectId: string, runId: string): string {
  return `/projects/${projectId}/results?run=${encodeURIComponent(runId)}`;
}

/** Where "what to add" sends the user: the input on the Intake step. */
export function intakeHref(projectId: string, inputId: string | null): string {
  const query = inputId ? `?input=${encodeURIComponent(inputId)}` : "";
  return `/projects/${projectId}${query}#intake`;
}
