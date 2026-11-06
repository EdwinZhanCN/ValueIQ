import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardListIcon,
  InfoIcon,
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
  clampPct,
  connectionNote,
  phaseItems,
  processAction,
  runHeading,
  shownView,
  type ConnectionState,
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
  latest: LatestOutcome | null;
  onStart: () => void;
  onCancel: () => void;
}

const MAX_MISSING = 6;

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
  const blockedFromStart = action.kind === "fix";
  const fresh = view.status === "idle";
  const note = connection === "open" ? null : connectionNote(connection);
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
      className="relative mx-auto flex w-full max-w-lg flex-col items-center gap-6 rounded-2xl border bg-card px-5 py-8 sm:gap-7 sm:px-9 sm:py-10"
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

      {fresh && blockedFromStart ? (
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
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            {connection === "connecting" ? (
              <Spinner aria-hidden />
            ) : (
              <WifiOffIcon className="size-4 shrink-0" aria-hidden />
            )}
            {note}
          </p>
        ) : null}
      </div>

      {view.status === "failed" ? <FailureNote view={view} /> : null}

      {view.status === "blocked_on_question" ? (
        <OpenQuestion question={view.pending_question} />
      ) : blockedFromStart && fresh ? null : (
        <Steps items={phaseItems(view)} />
      )}

      {blockedFromStart && props.hasForm ? (
        <MissingList missing={missing} />
      ) : null}

      {rerun ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <InfoIcon className="size-4 shrink-0" aria-hidden />
          Inputs changed since this run.
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
        {view.status === "running" || view.status === "preflight" ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={props.onCancel}
            disabled={connection !== "open" || props.cancelling}
          >
            {props.cancelling ? <Spinner /> : null}
            Cancel run
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
          {action.label}
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
      aria-label="Model build progress"
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

function MissingList({ missing }: { missing: readonly MissingInput[] }) {
  if (missing.length === 0) return null;
  const shown = missing.slice(0, MAX_MISSING);
  const more = missing.length - shown.length;
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="text-sm font-medium">Needed before a run can start</p>
      <ul className="flex w-full flex-col divide-y rounded-xl border">
        {shown.map((m) => (
          <li key={m.field} className="flex flex-col gap-0.5 px-3.5 py-2.5">
            <span className="text-sm font-medium">{m.label}</span>
            <span className="text-xs text-muted-foreground">{m.message}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="text-xs text-muted-foreground">and {more} more</p>
      ) : null}
    </div>
  );
}

function FailureNote({ view }: { view: RunView }) {
  const error = view.error;
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
        <p className="font-medium text-destructive">
          {error?.message ?? "The run failed."}
        </p>
        <p className="text-xs text-muted-foreground">
          {error ? (
            <>
              <code className="font-mono">{error.code}</code>
              {" · "}
            </>
          ) : null}
          {error?.retryable
            ? "Usually fixed by retrying."
            : "Retrying will not help until the cause is fixed."}
        </p>
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
