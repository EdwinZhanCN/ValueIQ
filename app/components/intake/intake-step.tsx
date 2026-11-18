import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Database,
  Save,
  ShieldCheck,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Goal } from "../../../shared/form";
import { GOAL_LABELS } from "../../lib/intake-fields";
import { readFormDraft } from "../../lib/intake-form";
import { cn } from "../../lib/utils";
import type { ProjectFileItem } from "../files/project-files";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { applyIntake, draftText } from "./intake-draft";
import { IntakeFiles } from "./intake-files";

type SaveResult = { error: string | null; saved: boolean; conflict?: true };

const GOAL_ICONS: Record<Goal, LucideIcon> = {
  time_savings: Clock,
  data_quality: Database,
  decision_speed: Zap,
  risk_reduction: ShieldCheck,
  new_clients: TrendingUp,
};

/**
 * Step 1, Intake (mock UI 03): project name, goals, the decision, and files.
 * No numbers here; they belong to Clarify. Saving writes the whole draft back
 * with this step's fields applied and Clarify's fields untouched.
 */
export function IntakeStep({
  projectId,
  projectName,
  initial,
  savedAt,
  files,
  target,
}: {
  projectId: string;
  projectName: string;
  initial: unknown;
  savedAt: string | null;
  files: ProjectFileItem[];
  target: string | null;
}) {
  const [draft] = useState(() => readFormDraft(initial));
  const [name, setName] = useState(
    () => draftText(draft, "project_name") || projectName,
  );
  const [decision, setDecision] = useState(() =>
    draftText(draft, "decision_statement"),
  );
  const [company, setCompany] = useState(() =>
    draftText(draft, "company_description"),
  );
  const [product, setProduct] = useState(() =>
    draftText(draft, "product_description"),
  );
  const [descError, setDescError] = useState(false);
  const [goals, setGoals] = useState<Goal[]>(draft.goals);
  const [unsaved, setUnsaved] = useState(false);
  const [goalError, setGoalError] = useState(false);
  const [next, setNext] = useState(false);
  const goalsRef = useRef<HTMLFieldSetElement>(null);
  const navigate = useNavigate();
  const saver = useFetcher<SaveResult>();
  const saving = saver.state !== "idle";
  const result = saver.state === "idle" ? saver.data : undefined;
  // Local time only after hydration: the server's time zone differs.
  const [savedLabel, setSavedLabel] = useState(savedAt ? "Saved" : "");
  useEffect(() => {
    setSavedLabel(
      savedAt
        ? `Saved ${new Date(savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
        : "",
    );
  }, [savedAt]);
  useEffect(() => {
    if (!result) return;
    if (result.saved) {
      setUnsaved(false);
      if (next) void navigate(`/projects/${projectId}/clarify?prep=1`);
    }
    setNext(false);
  }, [result]);
  // Uploads land at once, but the form lists them only after the next save.
  const saved = readFormDraft(initial).file_descriptions;
  const pending = unsaved || files.some((file) => !(file.id in saved));
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  useEffect(() => {
    if (!target) return;
    const element = document.getElementById(`value-${target}`);
    element?.scrollIntoView({ block: "center" });
    element?.focus();
  }, [target]);

  function edit() {
    setUnsaved(true);
  }
  function save(thenContinue: boolean) {
    if (thenContinue && goals.length === 0) {
      setGoalError(true);
      goalsRef.current?.focus();
      return;
    }
    if (thenContinue && (!company.trim() || !product.trim())) {
      setDescError(true);
      return;
    }
    setDescError(false);
    setNext(thenContinue);
    const form = applyIntake(
      draft,
      { projectName: name, decision, company, product, goals },
      files,
    );
    void saver.submit(
      { formJson: JSON.stringify(form), baseUpdatedAt: savedAt ?? "" },
      { method: "post", action: `/projects/${projectId}/form` },
    );
  }

  return (
    <section
      id="intake"
      aria-label="Project intake"
      className="flex flex-col gap-6"
    >
      {result?.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive bg-destructive/5 p-3 text-sm"
        >
          {result.error}{" "}
          {result.conflict && (
            <Link reloadDocument to="." className="font-medium underline">
              Reload latest
            </Link>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-stretch gap-5">
        <div className="flex min-w-0 flex-[1_1_26rem] flex-col gap-6 rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="value-project_name"
              className="text-sm font-semibold"
            >
              Project name
            </label>
            <Input
              id="value-project_name"
              className="h-11 px-3.5"
              value={name}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                edit();
              }}
            />
          </div>
          <fieldset
            id="value-goals"
            ref={goalsRef}
            tabIndex={-1}
            aria-describedby={goalError ? "goals-error" : undefined}
            className="flex flex-col gap-2 outline-none"
          >
            <legend className="mb-2 text-sm font-semibold">Goals</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(9.5rem,100%),1fr))] gap-2">
              {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) => {
                const Icon = GOAL_ICONS[goal];
                const on = goals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setGoals((previous) =>
                        on
                          ? previous.filter((value) => value !== goal)
                          : [...previous, goal],
                      );
                      setGoalError(false);
                      edit();
                    }}
                    className={cn(
                      "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      on
                        ? "border-2 border-primary bg-accent font-semibold text-accent-foreground"
                        : "border-input bg-background hover:bg-muted",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    {GOAL_LABELS[goal]}
                  </button>
                );
              })}
            </div>
            {goalError && (
              <p id="goals-error" className="text-sm text-destructive">
                Pick at least one goal.
              </p>
            )}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="value-decision_statement"
              className="text-sm font-semibold"
            >
              Decision
            </label>
            <Textarea
              id="value-decision_statement"
              rows={2}
              maxLength={500}
              value={decision}
              placeholder="Should we automate the weekly reporting process?"
              onChange={(event) => {
                setDecision(event.target.value);
                edit();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="value-company_description"
              className="text-sm font-semibold"
            >
              About the company
            </label>
            <Textarea
              id="value-company_description"
              rows={3}
              maxLength={2000}
              value={company}
              placeholder="What the company does, its size and location, how it sells, and how busy the team is today."
              aria-invalid={descError && !company.trim()}
              onChange={(event) => {
                setCompany(event.target.value);
                edit();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="value-product_description"
              className="text-sm font-semibold"
            >
              The product or idea
            </label>
            <Textarea
              id="value-product_description"
              rows={3}
              maxLength={2000}
              value={product}
              placeholder="What you are evaluating, what it costs if you know, and what it is supposed to do."
              aria-invalid={descError && !product.trim()}
              onChange={(event) => {
                setProduct(event.target.value);
                edit();
              }}
            />
            {descError && (
              <p className="text-sm text-destructive">
                Add a short description of the company and of the product or
                idea so the assistant can help.
              </p>
            )}
          </div>
        </div>
        <IntakeFiles
          projectId={projectId}
          files={files}
          descriptions={draft.file_descriptions}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          className="h-11 px-4"
          nativeButton={false}
          render={<Link to="/projects" />}
        >
          <ArrowLeft />
          Back
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span role="status" className="text-xs text-muted-foreground">
            {saving
              ? "Saving…"
              : pending
                ? "Unsaved changes"
                : savedLabel || "Not saved yet"}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4"
            disabled={saving}
            onClick={() => save(false)}
          >
            <Save />
            Save draft
          </Button>
          <Button
            type="button"
            className="h-11 px-4"
            disabled={saving}
            onClick={() => save(true)}
          >
            {saving && next ? <Spinner className="size-4" /> : null}
            Continue to Clarify
            <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
