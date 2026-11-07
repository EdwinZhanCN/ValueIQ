import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardListIcon,
  InfoIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  SaveIcon,
  TriangleAlertIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { LABELS } from "~/lib/intake-fields";
import { cn } from "~/lib/utils";
import {
  canRerun,
  cancelControl,
  clampPct,
  connectionMessage,
  connectionStuck,
  errorCopy,
  floorNote,
  MAX_MISSING,
  missingSummary,
  STALE_INPUTS_NOTE,
  stallNote,
  inputStepHref,
  phaseItems,
  processAction,
  resultsHref,
  runHeading,
  shownView,
  type ConnectionState,
  type GapSummary,
  type LatestOutcome,
  type MissingInput,
  type PhaseItem,
  type ProcessAction,
} from "~/lib/run-ui";
import type { Question, RunView } from "../../../shared/types";

export interface RunPanelProps {
  projectId: string;
  /** The agent's synced state (or the empty view before it connects). */
  view: RunView;
  connection: ConnectionState;
  hasForm: boolean;
  /** What the strict form validator rejects; empty when a run may start. */
  missing: readonly MissingInput[];
  /** A start call is in flight. */
  busy: boolean;
  /** A cancel call is in flight. */
  cancelling: boolean;
  /** A message about the last button press (a refused or failed call), or null. */
  notice: string | null;
  /** Seconds the first connection attempt has been running. */
  connectingSecs?: number;
  /** Seconds since the run's status, step or progress last changed. */
  idleSecs?: number;
  latest: LatestOutcome | null;
  onStart: () => void;
  onCancel: () => void;
}

/**
 * The Process card (mock UI 05): progress ring, the run's own steps, "Saved ·
 * safe to leave", and two buttons, Projects and the next action. A pure view
 * of its props, so every run state renders without a connection.
 */
export function RunPanel(props: RunPanelProps) {
  const { projectId, connection, latest, missing } = props;
  const view = shownView(props.view, latest);
  const action = processAction({
    projectId,
    view,
    connection,
    hasForm: props.hasForm,
    missing,
    busy: props.busy,
    cancelling: props.cancelling,
  });
  const rerun = canRerun({ view, latest, hasForm: props.hasForm, missing });
  const cancel = cancelControl({
    view,
    connection,
    cancelling: props.cancelling,
  });
  const blockedFromStart = action.kind === "fix";
  // A run that ended with a gap list: a result of its own, not an error.
  const gapRun = view.status === "gap_list";
  const gap =
    gapRun &&
    latest?.runId === view.run_id &&
    latest.summary?.kind === "gap_list"
      ? latest.summary
      : null;
  const fresh = view.status === "idle";
  const stuck = connectionStuck(connection, props.connectingSecs ?? 0);
  const note =
    connection === "open"
      ? null
      : connectionMessage(connection, props.connectingSecs ?? 0);
  const stall = stallNote(view, props.idleSecs ?? 0);
  const retryFailed =
    view.status === "failed" &&
    action.kind === "start" &&
    action.label === "Retry";
  const title =
    fresh && blockedFromStart
      ? props.hasForm
        ? "A few inputs are missing"
        : "Start with Intake"
      : fresh
        ? "Ready to build your decision model"
        : runHeading(view).title;

  return (
    <section
      aria-labelledby="process-heading"
      className={cn(
        "relative mx-auto flex w-full flex-col items-center gap-6 rounded-2xl border bg-card px-5 py-8 sm:gap-7 sm:px-9 sm:py-10",
        gapRun ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {view.mode === "stub" ? (
        <Badge
          variant="destructive"
          title="Not a real assessment"
          className="absolute top-4 right-4"
        >
          STUB
        </Badge>
      ) : null}

      {gapRun ? (
        <span className="flex size-20 items-center justify-center rounded-full bg-accent text-primary">
          <ListChecksIcon className="size-8" aria-hidden />
        </span>
      ) : fresh && blockedFromStart ? (
        <span className="flex size-20 items-center justify-center rounded-full bg-accent text-primary">
          <ClipboardListIcon className="size-8" aria-hidden />
        </span>
      ) : (
        <ProgressRing view={view} />
      )}

      <div className="flex flex-col items-center gap-2 text-center">
        <h2
          id="process-heading"
          className="font-heading text-xl font-semibold sm:text-[1.375rem]"
        >
          {title}
        </h2>
        {note ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            {connection === "connecting" ? (
              <Spinner aria-hidden />
            ) : (
              <WifiOffIcon className="size-4 shrink-0" aria-hidden />
            )}
            {note}
            {stuck ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            ) : null}
          </p>
        ) : null}
        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {stall ??
            (view.status === "running" || view.status === "preflight"
              ? view.step
              : null)}
        </p>
      </div>

      {view.status === "failed" ? <FailureNote view={view} /> : null}

      {view.status === "cancelled" ? (
        <p role="status" className="text-center text-sm text-muted-foreground">
          The run was stopped. Your form and files are saved; start a new run
          whenever you are ready.
        </p>
      ) : null}

      {view.status === "blocked_on_question" ? (
        <OpenQuestion question={view.pending_question} />
      ) : blockedFromStart && fresh ? null : (
        <Steps items={phaseItems(view)} />
      )}

      {gapRun ? (
        <GapCard
          projectId={projectId}
          gap={gap}
          loading={latest?.runId !== view.run_id}
          runId={view.run_id}
        />
      ) : null}

      {blockedFromStart && props.hasForm ? (
        <MissingList projectId={projectId} missing={missing} />
      ) : null}

      {rerun ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <InfoIcon className="size-4 shrink-0" aria-hidden />
          {STALE_INPUTS_NOTE}
        </p>
      ) : null}

      {view.run_id ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <SaveIcon className="size-4" aria-hidden />
          Saved · safe to leave
        </p>
      ) : null}

      <div className="flex w-full flex-wrap justify-center gap-3">
        <Link
          to="/projects"
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Projects
        </Link>
        {cancel.show && action.kind !== "cancel" ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={props.onCancel}
            disabled={!cancel.enabled}
            title={cancel.reason ?? undefined}
          >
            {props.cancelling ? <Spinner /> : null}
            {cancel.label}
          </Button>
        ) : null}
        {rerun && view.run_id ? (
          <Link
            to={resultsHref(projectId, view.run_id)}
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            View old result
          </Link>
        ) : null}
        {retryFailed ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={props.onStart}
            disabled={connection !== "open" || props.busy}
          >
            Start new run
          </Button>
        ) : null}
        {rerun ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={props.onStart}
            disabled={connection !== "open" || props.busy}
          >
            {props.busy ? <Spinner /> : null}
            Run again
          </Button>
        ) : null}
        <Primary
          action={action}
          busy={props.busy}
          cancelling={props.cancelling}
          onStart={props.onStart}
          onCancel={props.onCancel}
        />
      </div>

      {props.notice ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {props.notice}
        </p>
      ) : null}
    </section>
  );
}

function Primary({
  action,
  busy,
  cancelling,
  onStart,
  onCancel,
}: {
  action: ProcessAction;
  busy: boolean;
  cancelling: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  const arrow = <ArrowRightIcon data-icon="inline-end" aria-hidden />;
  switch (action.kind) {
    case "fix":
    case "back":
    case "results":
      return (
        <Link to={action.href} className={buttonVariants({ size: "lg" })}>
          {action.label}
          {arrow}
        </Link>
      );
    case "waiting":
      return (
        <Button type="button" size="lg" disabled>
          {action.label}
          {arrow}
        </Button>
      );
    case "start":
      return (
        <Button
          type="button"
          size="lg"
          onClick={onStart}
          disabled={!action.enabled}
        >
          {busy ? <Spinner /> : null}
          {action.label}
          {busy ? null : arrow}
        </Button>
      );
    case "cancel":
      return (
        <Button
          type="button"
          size="lg"
          onClick={onCancel}
          disabled={!action.enabled}
        >
          {cancelling ? <Spinner /> : null}
          {cancelling ? "Cancelling..." : action.label}
        </Button>
      );
  }
}

function ProgressRing({ view }: { view: RunView }) {
  const pct = clampPct(view.progress_pct);
  const failed = view.status === "failed";
  return (
    <div
      role="progressbar"
      aria-label="Assessment progress"
      aria-valuetext={`${pct} percent`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="flex size-32 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${failed ? "var(--destructive)" : "var(--primary)"} 0 ${pct}%, var(--muted) ${pct}% 100%)`,
      }}
    >
      <span className="flex size-[6.75rem] items-center justify-center rounded-full bg-card text-3xl font-semibold tracking-tight tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

function StepMark({ state }: { state: PhaseItem["state"] }) {
  const base =
    "flex size-[1.625rem] shrink-0 items-center justify-center rounded-full";
  switch (state) {
    case "done":
      return (
        <span className={cn(base, "bg-accent text-primary")}>
          <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
      );
    case "doing":
      return (
        <span className={cn(base, "border-2 border-primary text-primary")}>
          <LoaderCircleIcon
            className="size-3.5 motion-safe:animate-spin"
            strokeWidth={3}
            aria-hidden
          />
        </span>
      );
    case "error":
      return (
        <span className={cn(base, "bg-destructive/10 text-destructive")}>
          <XIcon className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
      );
    case "todo":
      return <span className={cn(base, "border-[1.5px] border-border")} />;
  }
}

function Steps({ items }: { items: PhaseItem[] }) {
  if (items.length === 0) return null;
  return (
    <ol aria-label="Assessment steps" className="flex w-full flex-col gap-1">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "flex items-center gap-3.5 rounded-[0.625rem] px-3.5 py-2.5",
            item.state === "doing" && "bg-accent/60 font-semibold",
            item.state === "todo" && "text-muted-foreground",
            item.state === "error" && "text-destructive",
          )}
        >
          <StepMark state={item.state} />
          <span className="flex-1">{item.label}</span>
          {item.state === "doing" && item.total > 1 ? (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {item.done} of {item.total}
            </span>
          ) : null}
          <span className="sr-only">{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

function MissingList({
  projectId,
  missing,
}: {
  projectId: string;
  missing: readonly MissingInput[];
}) {
  if (missing.length === 0) return null;
  const sum = missingSummary(missing, MAX_MISSING);
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="text-sm font-medium">
        Needed before an assessment can start
        <span className="font-normal text-muted-foreground">
          {" · "}
          {sum.caption}
        </span>
      </p>
      {sum.groups.map((group) => (
        <div key={group.step} className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            {group.title}
          </p>
          <ul className="flex w-full flex-col divide-y rounded-xl border">
            {group.items.map((m) => (
              <li key={m.field}>
                <Link
                  to={inputStepHref(projectId, m.field)}
                  className="flex flex-col gap-0.5 rounded-xl px-3.5 py-2.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.message}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {sum.more > 0 ? (
        <p className="text-xs text-muted-foreground">
          and {sum.more} more.{" "}
          <Link
            to={inputStepHref(projectId, null)}
            className="underline underline-offset-2"
          >
            See them on Clarify
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function FailureNote({ view }: { view: RunView }) {
  const error = view.error;
  const copy = errorCopy(error?.code);
  return (
    <div
      role="alert"
      className="flex w-full items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-sm"
    >
      <TriangleAlertIcon
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-destructive">{copy.what}</p>
        <p className="text-muted-foreground">{copy.next}</p>
        {error ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Details</summary>
            <p className="mt-1 break-words">
              <code className="font-mono">{error.code}</code>
              {error.message ? ` · ${error.message}` : ""}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

/** A mid-run question, read-only: answering in the app is not built yet. */
function OpenQuestion({ question }: { question: Question | null }) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <MessageCircleQuestionIcon
          className="size-4 shrink-0 text-primary"
          aria-hidden
        />
        Open question
      </p>
      {question ? (
        <>
          <p className="text-base font-medium">{question.text}</p>
          {question.why_blocking ? (
            <p className="text-muted-foreground">{question.why_blocking}</p>
          ) : null}
          {question.affects.length > 0 ? (
            <ul aria-label="Affects" className="flex flex-wrap gap-1.5">
              {question.affects.map((id) => (
                <li key={id}>
                  <Badge variant="outline">{LABELS[id] ?? id}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Answering here is not available yet. Cancel the run, update Clarify,
        then start again.
      </p>
    </div>
  );
}

/**
 * A run that ended below the confidence floor (mock UI 05 has no state for
 * it, so it reuses the card). Not an error: project confidence against the
 * floor, the engine's ranked "what to add" list with a link to the step that
 * edits each input, and the drivers that were left out.
 */
function GapCard({
  projectId,
  gap,
  loading,
  runId,
}: {
  projectId: string;
  gap: GapSummary | null;
  loading: boolean;
  runId: string | null;
}) {
  if (!gap)
    return (
      <div className="flex w-full flex-col gap-2 rounded-xl border bg-muted/40 p-4 text-sm">
        {loading ? (
          <p role="status" className="flex items-center gap-2">
            <Spinner aria-hidden />
            Loading what to add...
          </p>
        ) : (
          <p>The saved list could not be read.</p>
        )}
        <p className="text-muted-foreground">
          There is not enough backed evidence to give a result yet.
          {runId ? (
            <>
              {" "}
              <Link
                to={resultsHref(projectId, runId)}
                className="underline underline-offset-2"
              >
                Open it on the Review step
              </Link>
              .
            </>
          ) : null}
        </p>
      </div>
    );
  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <p className="text-center text-sm text-muted-foreground">
        {gap.reason}. These are next steps, not an error.
      </p>
      <p className="text-center text-sm text-muted-foreground">
        {floorNote(gap.floor, gap.dropped[0]?.floor ?? null)}
      </p>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border text-sm">
        <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">Project confidence</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {gap.confidence}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">Needed for a result</dt>
          <dd className="text-lg font-semibold tabular-nums">{gap.floor}</dd>
        </div>
      </dl>
      {gap.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">What to add, in order</p>
          <ol aria-label="What to add" className="flex flex-col gap-2">
            {gap.items.map((item) => (
              <li
                key={item.rank}
                className="flex items-start gap-3 rounded-xl border p-3.5"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {item.rank}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.whatToAdd}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Confidence {item.confidenceNow} now, up to{" "}
                    {item.confidenceIfAdded} if added
                  </p>
                </div>
                <Link
                  to={inputStepHref(projectId, item.inputId)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`Add: ${item.label}`}
                >
                  Add this
                  <ArrowRightIcon data-icon="inline-end" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            The options are alternatives, not amounts to add together.
          </p>
        </div>
      ) : null}
      {gap.dropped.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Left out for now</p>
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            {gap.dropped.map((driver) => (
              <li
                key={driver.id}
                className="flex flex-wrap justify-between gap-x-3 px-3.5 py-2"
              >
                <span>{driver.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {driver.confidence} confidence; this part needs {driver.floor}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {runId ? (
        <p className="text-center text-sm">
          <Link
            to={resultsHref(projectId, runId)}
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            See the full list on Review
          </Link>
        </p>
      ) : null}
    </div>
  );
}
