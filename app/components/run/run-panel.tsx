import {
  ArrowRightIcon,
  CheckIcon,
  CircleIcon,
  CircleXIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import {
  checklistItems,
  clampPct,
  connectionNote,
  intakeHref,
  isActive,
  resultsHref,
  runControls,
  runHeading,
  utcStamp,
  type ConnectionState,
  type GapSummary,
  type LatestOutcome,
  type ResultSummary,
  type StepItem,
} from "~/lib/run-ui";
import type { RunView } from "../../../shared/types";

/** Mirrors `PreflightReport` in `assistant/run/orchestrator.ts` without its `details`. */
export type ReadinessReport = { passed: boolean; message: string };

export interface RunPanelProps {
  projectId: string;
  view: RunView;
  connection: ConnectionState;
  hasForm: boolean;
  /** A start, retry or readiness call is in flight. */
  busy: boolean;
  /** A cancel call is in flight. */
  cancelling: boolean;
  /** A message about the last button press (a refused or failed call), or null. */
  notice: string | null;
  readiness: ReadinessReport | null;
  latest: LatestOutcome | null;
  onStart: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onReadiness: () => void;
}

/**
 * The "Run assessment" section: start button, live progress, failure and
 * cancel states, and the latest saved outcome. Pure view of its props, so every
 * state can be rendered without a connection.
 */
export function RunPanel(props: RunPanelProps) {
  const { view, connection, latest } = props;
  const controls = runControls({
    view,
    connection,
    hasForm: props.hasForm,
    busy: props.busy,
    cancelling: props.cancelling,
  });
  const active = isActive(view.status);
  const note = connectionNote(connection);
  const finishedLive = view.status === "released" || view.status === "gap_list";
  // The run just ended: the outcome loads from the server a moment later.
  const awaitingOutcome =
    finishedLive && (latest === null || latest.runId !== view.run_id);
  const showStale = latest?.formChangedSince === true && !active;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-medium">Run assessment</h2>
        {view.mode === "stub" ? <StubBadge /> : null}
        <ConnectionBadge state={connection} />
      </div>

      {note && connection !== "open" ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
        >
          {connection === "denied" || connection === "reconnecting" ? (
            <WifiOffIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Spinner className="mt-0.5" />
          )}
          {note}
        </p>
      ) : null}

      {active ? <ProgressCard view={view} /> : null}

      {view.status === "failed" ? <FailureCard view={view} /> : null}

      {view.status === "cancelled" ? (
        <p
          role="status"
          className="rounded-lg border p-3 text-sm text-muted-foreground"
        >
          Run cancelled. Your form and files are saved; nothing was lost. Start
          a new run whenever you are ready.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {controls.start.show ? (
          <Button
            type="button"
            onClick={props.onStart}
            disabled={!controls.start.enabled}
            aria-describedby={controls.reason ? "run-reason" : undefined}
          >
            {props.busy ? <Spinner /> : null}
            {controls.start.label}
          </Button>
        ) : null}
        {controls.retry.show ? (
          <Button
            type="button"
            onClick={props.onRetry}
            disabled={!controls.retry.enabled}
          >
            {props.busy ? <Spinner /> : null}
            Retry
          </Button>
        ) : null}
        {controls.cancel.show ? (
          <Button
            type="button"
            variant="outline"
            onClick={props.onCancel}
            disabled={!controls.cancel.enabled}
          >
            Cancel run
          </Button>
        ) : null}
        {controls.preflight.show ? (
          <Button
            type="button"
            variant="outline"
            onClick={props.onReadiness}
            disabled={!controls.preflight.enabled}
          >
            Check readiness
          </Button>
        ) : null}
      </div>

      {controls.reason ? (
        <p id="run-reason" className="text-sm text-muted-foreground">
          {controls.reason}
        </p>
      ) : null}

      {props.notice ? (
        <p role="alert" className="text-sm text-destructive">
          {props.notice}
        </p>
      ) : null}

      {props.readiness && !active ? (
        <Readiness report={props.readiness} />
      ) : null}

      {awaitingOutcome ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner />
          Loading the saved outcome...
        </p>
      ) : null}

      {latest && !active && !awaitingOutcome ? (
        <>
          {showStale ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              The form was saved after this run finished. Run again to update
              the outcome.
            </p>
          ) : null}
          <Outcome projectId={props.projectId} latest={latest} />
        </>
      ) : null}
    </div>
  );
}

function StubBadge() {
  return (
    <Badge variant="destructive" title="Not a real assessment">
      STUB
    </Badge>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  if (state === "open") return <Badge variant="outline">Connected</Badge>;
  if (state === "denied") return <Badge variant="destructive">No access</Badge>;
  return (
    <Badge variant="secondary">
      {state === "connecting" ? "Connecting" : "Reconnecting"}
    </Badge>
  );
}

function Readiness({ report }: { report: ReadinessReport }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">Readiness check</span>
        <Badge variant={report.passed ? "secondary" : "outline"}>
          {report.passed ? "Ready to run" : "Needs attention"}
        </Badge>
      </div>
      {report.message ? (
        <p className="whitespace-pre-line text-muted-foreground">
          {report.message}
        </p>
      ) : null}
    </div>
  );
}

// ---------- progress ----------

/** The mockup's loading card: progress ring, step label, checklist, "safe to leave". */
function ProgressCard({ view }: { view: RunView }) {
  const heading = runHeading(view);
  const pct = clampPct(view.progress_pct);
  const blocked = view.status === "blocked_on_question";
  return (
    <section
      aria-labelledby="run-heading"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border bg-card p-6"
    >
      <div
        role="progressbar"
        aria-label="Assessment progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="flex size-28 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(var(--primary) 0 ${pct}%, var(--muted) ${pct}% 100%)`,
        }}
      >
        <span className="flex size-[5.5rem] items-center justify-center rounded-full bg-card text-2xl font-semibold tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 id="run-heading" className="font-heading text-xl font-medium">
          {heading.title}
        </h3>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {heading.detail}
        </p>
      </div>
      {blocked ? (
        <p className="text-sm text-muted-foreground">
          Not supported yet. Cancel this run and start a new one.
        </p>
      ) : (
        <Checklist items={checklistItems(view)} />
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckIcon className="size-3.5" aria-hidden />
        Progress saved. Safe to leave this page.
      </p>
    </section>
  );
}

const STEP_ICON_CLASS = "size-4 shrink-0";

function StepIcon({ state }: { state: StepItem["state"] }) {
  switch (state) {
    case "done":
      return (
        <CheckIcon
          className={cn(STEP_ICON_CLASS, "text-primary")}
          aria-hidden
        />
      );
    case "doing":
      return (
        <LoaderCircleIcon
          className={cn(
            STEP_ICON_CLASS,
            "text-primary motion-safe:animate-spin",
          )}
          aria-hidden
        />
      );
    case "error":
      return (
        <CircleXIcon
          className={cn(STEP_ICON_CLASS, "text-destructive")}
          aria-hidden
        />
      );
    case "todo":
      return (
        <CircleIcon
          className={cn(STEP_ICON_CLASS, "text-muted-foreground/60")}
          aria-hidden
        />
      );
  }
}

function Checklist({ items }: { items: StepItem[] }) {
  return (
    <ol aria-label="Assessment steps" className="flex w-full flex-col gap-1">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
            item.state === "doing" && "bg-muted font-medium",
            item.state === "todo" && "text-muted-foreground",
            item.state === "error" && "text-destructive",
          )}
        >
          <StepIcon state={item.state} />
          <span className="flex-1">{item.label}</span>
          <span className="sr-only">{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------- failure ----------

function FailureCard({ view }: { view: RunView }) {
  const error = view.error;
  return (
    <section
      aria-label="Run failed"
      className="flex flex-col gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
    >
      <div role="alert" className="flex items-start gap-2">
        <TriangleAlertIcon
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-destructive">
            {error?.message ?? "The run failed."}
          </p>
          {error ? (
            <p className="text-xs text-muted-foreground">
              Code: <code className="font-mono">{error.code}</code>
              {error.retryable
                ? ". This kind of failure can usually be retried."
                : ". Retrying will not help until the cause is fixed."}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            Progress saved: your form and files are intact, and finished steps
            are kept.
          </p>
        </div>
      </div>
      {view.checklist.some((c) => c.state !== "todo") ? (
        <Checklist items={checklistItems(view)} />
      ) : null}
    </section>
  );
}

// ---------- saved outcome ----------

function Outcome({
  projectId,
  latest,
}: {
  projectId: string;
  latest: LatestOutcome;
}) {
  const summary = latest.summary;
  if (!summary) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
      >
        The saved outcome of the last run could not be read, so no figures are
        shown. Run again to produce a new one.
      </p>
    );
  }
  return summary.kind === "result" ? (
    <ResultCard projectId={projectId} summary={summary} />
  ) : (
    <GapCard projectId={projectId} summary={summary} />
  );
}

function OutcomeHeader({
  title,
  stub,
  label,
  generatedAt,
}: {
  title: string;
  stub: boolean;
  label: string;
  generatedAt: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-heading text-base font-medium">{title}</h3>
      {stub ? <StubBadge /> : null}
      <Badge variant="outline">{label}</Badge>
      {generatedAt ? (
        <time dateTime={generatedAt} className="text-xs text-muted-foreground">
          {utcStamp(generatedAt)}
        </time>
      ) : null}
    </div>
  );
}

function ResultCard({
  projectId,
  summary,
}: {
  projectId: string;
  summary: ResultSummary;
}) {
  const href = resultsHref?.(projectId, summary.runId) ?? null;
  return (
    <section
      aria-label="Latest result"
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <OutcomeHeader
        title="Latest result"
        stub={summary.stub}
        label={summary.label}
        generatedAt={summary.generatedAt}
      />
      {summary.stub ? (
        <p className="text-sm text-destructive">
          STUB run: these figures come from a scripted stand-in, not a real
          assessment.
        </p>
      ) : null}
      {summary.assumptions ? (
        <p className="text-xs text-muted-foreground">{summary.assumptions}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-96 text-sm">
          <caption className="sr-only">Headline figures</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Measure
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Capacity-inclusive
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Hard savings only
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.key} className="border-t align-top">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {row.label}
                </th>
                <Figure cell={row.capacity} />
                <Figure cell={row.hard} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.bandNote ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Confidence: </span>
          {summary.bandNote}
        </p>
      ) : null}
      <div>
        {href ? (
          <Link to={href} className={buttonVariants({ variant: "outline" })}>
            View full results
            <ArrowRightIcon aria-hidden />
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">
            The full results page is not built yet.
          </p>
        )}
      </div>
    </section>
  );
}

function Figure({ cell }: { cell: { text: string; reason: string | null } }) {
  return (
    <td className="py-2 pr-3 tabular-nums">
      <span className={cell.reason ? "text-muted-foreground" : undefined}>
        {cell.text}
      </span>
      {cell.reason ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {cell.reason}
        </span>
      ) : null}
    </td>
  );
}

function GapCard({
  projectId,
  summary,
}: {
  projectId: string;
  summary: GapSummary;
}) {
  const first = summary.items[0];
  return (
    <section
      aria-label="What to add"
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <OutcomeHeader
        title="Not enough evidence for a result yet"
        stub={summary.stub}
        label={summary.label}
        generatedAt={summary.generatedAt}
      />
      {summary.stub ? (
        <p className="text-sm text-destructive">
          STUB run: this list comes from a scripted stand-in, not a real
          assessment.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {summary.reason}. Project confidence is {summary.confidence}; the
        project needs {summary.floor}. Adding the evidence below raises it. This
        is a normal outcome, not an error.
      </p>
      {summary.items.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {summary.items.map((item) => (
            <li
              key={`${item.rank}-${item.label}`}
              className="flex gap-3 rounded-lg border p-3 text-sm"
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
              >
                {item.rank}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <p className="font-medium">
                  <span className="sr-only">{`Priority ${item.rank}: `}</span>
                  {item.label}
                </p>
                <p className="text-muted-foreground">{item.whatToAdd}</p>
                <p className="text-xs text-muted-foreground">
                  Confidence {item.confidenceNow} now, {item.confidenceIfAdded}{" "}
                  if added.
                </p>
              </div>
              <Link
                to={intakeHref(projectId, item.inputId)}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Go to input
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      <div>
        <Link
          to={intakeHref(projectId, first?.inputId ?? null)}
          className={buttonVariants({ variant: "default" })}
        >
          Back to the intake form
          <ArrowRightIcon aria-hidden />
        </Link>
      </div>
    </section>
  );
}
