import { ListChecks } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { buttonVariants } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { readFormDraft, validateFormFile } from "../../lib/intake-form";
import { DefaultsCard } from "./defaults-card";
import { InputsPanel } from "./inputs-panel";
import { OPTIONAL } from "./draft";
import {
  groupsOf,
  defaultFields,
  labelOf,
  valueOf,
  type Group,
} from "./progress";
import { CollapsedRow, QuestionCard } from "./question-card";
import { useFormDraft, type DraftFile } from "./use-form-draft";

type Open = Group["key"] | "defaults" | null;

/**
 * Step 2, Clarify (mock UI 04): the numbers behind the goals picked on
 * Intake, asked one group at a time beside a panel of what is entered so
 * far. Industry defaults come first. No assistant: every value is typed or
 * an explicitly accepted, labeled proxy.
 */
export function ClarifyStep({
  projectId,
  initial,
  savedAt,
  files,
  target,
}: {
  projectId: string;
  initial: unknown;
  savedAt: string | null;
  files: DraftFile[];
  target: string | null;
}) {
  if (!readFormDraft(initial).goals.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>No goals yet</EmptyTitle>
          <EmptyDescription>
            Pick at least one goal on Intake; Clarify asks for its numbers.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to={`/projects/${projectId}`} className={buttonVariants()}>
            Back to Intake
          </Link>
        </EmptyContent>
      </Empty>
    );
  return (
    <ClarifyQuestions
      projectId={projectId}
      initial={initial}
      savedAt={savedAt}
      files={files}
      target={target}
    />
  );
}

function ClarifyQuestions({
  projectId,
  initial,
  savedAt,
  files,
  target,
}: {
  projectId: string;
  initial: unknown;
  savedAt: string | null;
  files: DraftFile[];
  target: string | null;
}) {
  const navigate = useNavigate();
  const draft = useFormDraft({ projectId, initial, savedAt, files });
  const groups = groupsOf(draft);
  const defaults = defaultFields(draft);
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const pendingDefaults = defaults.filter(
    (id) => !draft.byId.get(id) && !declined.has(id),
  );
  const groupOf = (id: string) =>
    groups.find((group) => group.fields.includes(id));
  const [open, setOpen] = useState<Open>(() => {
    const targeted = target ? groupOf(target) : undefined;
    if (targeted) return targeted.key;
    if (pendingDefaults.length) return "defaults";
    return groups.find((group) => !group.complete)?.key ?? null;
  });
  const [focus, setFocus] = useState<string | null>(target);
  // Saving runs after the next render, so it includes this click's edits.
  const [saveSoon, setSaveSoon] = useState(false);
  const continuing = useRef(false);
  const clarifyIds = new Set(groups.flatMap((group) => group.fields));
  const problems = validateFormFile(draft.candidate(), draft.context);

  useEffect(() => {
    if (!target) return;
    const targeted = groups.find((group) => group.fields.includes(target));
    if (targeted) setOpen(targeted.key);
    setFocus(target);
    // Only a new ?input= target moves the page.
  }, [target]);

  useEffect(() => {
    if (!focus) return;
    const element = document.getElementById(`value-${focus}`);
    element?.scrollIntoView({ block: "center" });
    element?.focus();
    setFocus(null);
  }, [focus, open]);

  useEffect(() => {
    if (!saveSoon) return;
    setSaveSoon(false);
    if (draft.unsaved) draft.save();
  }, [saveSoon, draft]);

  useEffect(() => {
    if (!continuing.current || draft.saving || !draft.saved) return;
    continuing.current = false;
    if (draft.saved.saved) void navigate(`/projects/${projectId}/process`);
  }, [draft.saving, draft.saved, navigate, projectId]);

  function show(key: Open) {
    setOpen(key);
    if (key)
      requestAnimationFrame(() =>
        document
          .getElementById(key === "defaults" ? "defaults-card" : `card-${key}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
  }

  /** Next unfinished group after `from`, wrapping around; null when none. */
  function next(from: Open, skip: ReadonlySet<string> = new Set()) {
    const index = groups.findIndex((group) => group.key === from);
    const ordered = [...groups.slice(index + 1), ...groups.slice(0, index + 1)];
    return (
      ordered.find(
        (group) =>
          group.key !== from &&
          group.gaps.some((id) => !skip.has(id)) &&
          !group.complete,
      )?.key ?? null
    );
  }

  function pick(id: string) {
    const group = groupOf(id);
    if (group) setOpen(group.key);
    setFocus(id);
  }

  function confirm(group: Group) {
    if (draft.issues.some((issue) => group.fields.includes(issue.field)))
      return pick(
        draft.issues.find((issue) => group.fields.includes(issue.field))!.field,
      );
    show(next(group.key));
    setSaveSoon(true);
  }

  function notSure(group: Group) {
    const rest = group.gaps.filter(
      (id) => id !== "currency" && id !== "horizon_years",
    );
    for (const id of rest) draft.notSure(id);
    show(next(group.key, new Set(rest)));
    setSaveSoon(true);
  }

  function proceed() {
    if (problems.length) return;
    continuing.current = true;
    draft.save();
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section
        aria-label="Clarify questions"
        className="flex min-w-0 flex-[2_1_34rem] flex-col gap-3.5"
      >
        {draft.saved?.error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive p-3 text-sm"
          >
            {draft.saved.error}{" "}
            {draft.saved.conflict && (
              <Link reloadDocument to="." className="underline">
                Reload latest
              </Link>
            )}
          </p>
        )}
        {defaults.length > 0 && (
          <div id="defaults-card" className="scroll-mt-24">
            <DefaultsCard
              draft={draft}
              ids={defaults}
              declined={declined}
              open={open === "defaults"}
              onOpen={() => show("defaults")}
              onDecline={(id) =>
                setDeclined((previous) => new Set([...previous, id]))
              }
              onDone={() => {
                show(next("defaults", new Set(pendingDefaults)));
                setSaveSoon(true);
              }}
            />
          </div>
        )}
        {groups.map((group, index) =>
          group.key === open ? (
            <QuestionCard
              key={group.key}
              group={group}
              counter={`${index + 1} / ${groups.length}`}
              draft={draft}
              onConfirm={() => confirm(group)}
              onNotSure={() => notSure(group)}
            />
          ) : (
            <div
              key={group.key}
              id={`card-${group.key}`}
              className="scroll-mt-24"
            >
              <CollapsedRow
                title={group.title}
                summary={summary(draft, group)}
                complete={group.complete}
                onEdit={() => show(group.key)}
              />
            </div>
          ),
        )}
      </section>
      <InputsPanel
        draft={draft}
        groups={groups}
        problems={problems}
        clarifyIds={clarifyIds}
        onPick={pick}
        onContinue={proceed}
        continuing={continuing.current}
      />
    </div>
  );
}

function summary(draft: ReturnType<typeof useFormDraft>, group: Group): string {
  const required = group.fields.filter((id) => !OPTIONAL.has(id));
  if (!group.complete)
    return `${required.length - group.gaps.length} of ${required.length} answered`;
  const values = group.fields
    .map((id) => valueOf(draft, id))
    .filter((value): value is string => value !== null)
    .slice(0, 2);
  return values.length ? values.join(" · ") : labelOf(group.fields[0]!);
}
