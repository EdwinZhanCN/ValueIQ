import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Circle, CircleHelp, Save } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { FormIssue } from "../../../shared/form";
import { INPUT_RULES } from "../../lib/intake-catalog";
import { inputStep, inputStepHref } from "../../lib/run-ui";
import { OPTIONAL } from "./draft";
import {
  ASK_EVENT,
  DONE_EVENT,
  estimateMessage,
  settle,
  type DoneDetail,
} from "./estimate-ask";
import { type Group, isAnswered, labelOf, valueOf } from "./progress";
import type { FormDraft } from "./use-form-draft";

/** Set by the user or fixed by form rules; the assistant cannot fill them. */
const NOT_ESTIMABLE: ReadonlySet<string> = new Set([
  "currency",
  "horizon_years",
]);

export const ESTIMATE_ALL = "Estimate all remaining numbers.";

/**
 * What has been entered so far, per group, beside the questions; plus what
 * still blocks the Process step and the Continue action.
 */
export function InputsPanel({
  draft,
  groups,
  problems,
  clarifyIds,
  onPick,
  onContinue,
  continuing,
}: {
  draft: FormDraft;
  groups: Group[];
  problems: FormIssue[];
  clarifyIds: ReadonlySet<string>;
  onPick: (id: string) => void;
  onContinue: () => void;
  continuing: boolean;
}) {
  // Rows that asked the assistant for an estimate, and how that turn ended.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    function onDone(event: Event) {
      const done = (event as CustomEvent<DoneDetail>).detail;
      const { resolved, failed: missed } = settle(pendingRef.current, done);
      if (resolved.length + missed.length === 0) return;
      setPending(new Set());
      setFailed((previous) => {
        const next = new Set(previous);
        for (const id of resolved) next.delete(id);
        for (const id of missed) next.add(id);
        return next;
      });
    }
    window.addEventListener(DONE_EVENT, onDone);
    return () => window.removeEventListener(DONE_EVENT, onDone);
  }, []);
  function estimateOne(id: string) {
    setFailed((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
    setPending(new Set([id]));
    window.dispatchEvent(
      new CustomEvent(ASK_EVENT, {
        detail: { text: estimateMessage(labelOf(id)), ids: [id] },
      }),
    );
  }
  const required = groups.flatMap((group) =>
    group.fields.filter((id) => !OPTIONAL.has(id)),
  );
  const done = required.filter((id) => isAnswered(draft, id)).length;
  const rows = groups.flatMap((group) =>
    group.fields
      .filter((id) => !OPTIONAL.has(id))
      .map((id) => ({ id, group: group.title })),
  );
  const isOpen = (id: string) =>
    !isAnswered(draft, id) || draft.byId.get(id)?.tier === "user_unknown";
  const stillNeeded = rows.filter((row) => isOpen(row.id));
  const doneItems = rows.filter((row) => !isOpen(row.id));
  const unknown = [...draft.byId.values()].filter(
    (record) =>
      record.tier === "user_unknown" &&
      draft.visible.has(record.id) &&
      INPUT_RULES[record.id]?.role === "effect",
  );
  const missing = [
    ...new Map(problems.map((issue) => [issue.field, issue])).values(),
  ];
  return (
    <aside
      aria-labelledby="inputs-heading"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 id="inputs-heading" className="font-semibold">
            Inputs
          </h2>
          <span className="text-[0.8rem] text-muted-foreground">
            {done} / {required.length}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${Math.max(groups.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {groups.map((group) => (
            <span
              key={group.key}
              className={cn(
                "h-1.5 rounded-full",
                group.complete
                  ? "bg-primary"
                  : group.gaps.length < group.fields.length
                    ? "bg-chart-4"
                    : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>
      <section aria-label="Still needed" data-testid="still-needed">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Still needed{" "}
            <span className="font-normal text-muted-foreground">
              ({stillNeeded.length})
            </span>
          </h3>
          {stillNeeded.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent(ASK_EVENT, {
                    detail: { text: ESTIMATE_ALL, ids: [] },
                  }),
                )
              }
            >
              Estimate all remaining numbers
            </Button>
          )}
        </div>
        {stillNeeded.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is missing. Review the cards below, then continue.
          </p>
        ) : (
          <ul className="flex flex-col text-sm">
            {stillNeeded.map(({ id, group }) => (
              <li
                key={id}
                className="flex flex-wrap items-center gap-x-2 border-b last:border-b-0"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onPick(id)}
                >
                  {draft.byId.get(id)?.tier === "user_unknown" ? (
                    <CircleHelp
                      aria-label="Not sure"
                      className="size-4 shrink-0 text-chart-4"
                    />
                  ) : (
                    <Circle
                      aria-label="Missing"
                      className="size-4 shrink-0 text-destructive"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {labelOf(id)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {group}
                  </span>
                </button>
                {!NOT_ESTIMABLE.has(id) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={pending.has(id)}
                    data-testid={`estimate-row-${id}`}
                    aria-label={`Estimate ${labelOf(id)} with AI`}
                    onClick={() => estimateOne(id)}
                  >
                    {pending.has(id) ? "Estimating…" : "Estimate"}
                  </Button>
                )}
                {failed.has(id) && (
                  <p
                    role="status"
                    className="w-full pb-1.5 pl-6 text-xs text-muted-foreground"
                  >
                    Could not estimate this; ask in the chat.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {unknown.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Unquantified
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {unknown.map((record) => (
              <Badge key={record.id} variant="outline">
                {labelOf(record.id)}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {missing.length > 0 && (
        <div role="status" aria-live="polite">
          <h3 className="mb-1 text-xs font-medium text-destructive">
            Before Process
          </h3>
          <ul className="flex flex-col gap-1 text-[0.8rem]">
            {missing.map((issue) => (
              <li key={issue.field}>
                {clarifyIds.has(issue.field) ? (
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => onPick(issue.field)}
                  >
                    <span className="font-medium">{labelOf(issue.field)}</span>:{" "}
                    {issue.message}
                  </button>
                ) : (
                  <Link
                    to={inputStepHref(draft.projectId, issue.field)}
                    className="underline-offset-2 hover:underline"
                  >
                    <span className="font-medium">{labelOf(issue.field)}</span>:{" "}
                    {issue.message}
                    {inputStep(issue.field) === "intake" ? " (Intake)" : ""}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="h-9"
          onClick={draft.save}
          disabled={draft.saving}
        >
          <Save />
          {draft.saving ? "Saving…" : "Save draft"}
        </Button>
        <Button
          className="h-10"
          onClick={onContinue}
          disabled={missing.length > 0 || draft.saving || continuing}
        >
          Continue to Process
          <ArrowRight />
        </Button>
        <span
          role="status"
          className="text-center text-xs text-muted-foreground"
        >
          {draft.saving
            ? ""
            : draft.unsaved
              ? "Unsaved changes"
              : draft.savedLabel || "Not saved yet"}
        </span>
      </div>
      <details data-testid="done-inputs" className="rounded-xl border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
          Done{" "}
          <span className="font-normal text-muted-foreground">
            ({doneItems.length})
          </span>
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3">
          {groups.map((group) => {
            const rows = doneItems.filter((item) => item.group === group.title);
            if (rows.length === 0) return null;
            return (
              <section key={group.key} aria-label={`Done: ${group.title}`}>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                  {group.title}
                </h3>
                <ul className="flex flex-col text-sm">
                  {rows.map(({ id }) => {
                    const value = valueOf(draft, id);
                    return (
                      <li key={id} className="border-b last:border-b-0">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 py-1.5 text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => onPick(id)}
                        >
                          <Check
                            aria-label="Entered"
                            className="size-4 shrink-0 text-primary"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {labelOf(id)}
                          </span>
                          <span className="max-w-[45%] shrink-0 truncate font-semibold">
                            {value ?? "—"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </details>
    </aside>
  );
}
