import { ArrowRight, Check, Circle, CircleHelp, Save } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { FormIssue } from "../../../shared/form";
import { INPUT_RULES } from "../../lib/intake-catalog";
import { OPTIONAL } from "./draft";
import { type Group, isAnswered, labelOf, valueOf } from "./progress";
import type { FormDraft } from "./use-form-draft";

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
  const required = groups.flatMap((group) =>
    group.fields.filter((id) => !OPTIONAL.has(id)),
  );
  const done = required.filter((id) => isAnswered(draft, id)).length;
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
      className="flex flex-[1_1_17rem] flex-col gap-4 rounded-2xl border bg-card p-5"
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
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title}>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">
            {group.title}
          </h3>
          <ul className="flex flex-col text-sm">
            {group.fields.map((id) => {
              const record = draft.byId.get(id);
              const value = valueOf(draft, id);
              const unsure = record?.tier === "user_unknown";
              return (
                <li key={id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 py-1.5 text-left outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onPick(id)}
                  >
                    {unsure ? (
                      <CircleHelp
                        aria-label="Not sure"
                        className="size-4 shrink-0 text-chart-4"
                      />
                    ) : isAnswered(draft, id) ? (
                      <Check
                        aria-label="Entered"
                        className="size-4 shrink-0 text-primary"
                      />
                    ) : (
                      <Circle
                        aria-label={OPTIONAL.has(id) ? "Optional" : "Missing"}
                        className="size-4 shrink-0 text-muted-foreground/50"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {labelOf(id)}
                    </span>
                    <span
                      className={cn(
                        "max-w-[45%] shrink-0 truncate",
                        value ? "font-semibold" : "text-muted-foreground",
                      )}
                    >
                      {value ?? (unsure ? "?" : "—")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
                    to={`/projects/${draft.projectId}?input=${encodeURIComponent(issue.field)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    <span className="font-medium">{labelOf(issue.field)}</span>:{" "}
                    {issue.message} (Intake)
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
    </aside>
  );
}
