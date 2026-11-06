import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Download, FileText, Save } from "lucide-react";
import type { Goal } from "../../../shared/form";
import { GOAL_LABELS, LABELS } from "../../lib/intake-fields";
import { serializeFormFile } from "../../lib/intake-form";
import { control, FieldEditor } from "../clarify/field-editor";
import { useFormDraft, type DraftFile } from "../clarify/use-form-draft";

export type IntakeFile = DraftFile;

const action =
  "rounded-lg border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The project's all-in-one intake form (superseded by the Intake and Clarify
 * steps). It loads the saved draft (`initial`), saves drafts with an
 * edit-conflict check (`savedAt`), and references only files uploaded to this
 * project (`projectFiles`). Field logic lives in `components/clarify/`.
 */
export function StructuredIntake({
  projectId,
  initial,
  savedAt,
  projectFiles,
  target,
}: {
  projectId: string;
  initial: unknown;
  savedAt: string | null;
  projectFiles: IntakeFile[];
  target?: string | null;
}) {
  const [json, setJson] = useState<string | null>(null);
  const [ready, setReady] = useState("");
  const summary = useRef<HTMLDivElement>(null);
  const draft = useFormDraft({
    projectId,
    initial,
    savedAt,
    files: projectFiles,
    onDirty: () => {
      setJson(null);
      setReady("");
    },
  });
  const {
    goals: selected,
    currency,
    horizon,
    notes,
    plans,
    fileNotes,
    paths,
    sections,
    issues,
    saving,
    saved,
    unsaved,
    savedLabel,
  } = draft;
  useEffect(() => {
    if (!target) return;
    const element = document.getElementById(`value-${target}`);
    element?.scrollIntoView({ block: "center" });
    element?.focus();
  }, [target]);
  const fileName = new Map(projectFiles.map((file) => [file.id, file.name]));
  function validate(): string | null {
    const { form, issues: found } = draft.check();
    if (found.length) {
      setJson(null);
      requestAnimationFrame(() => summary.current?.focus());
      return null;
    }
    const serialized = serializeFormFile(form, draft.context);
    setJson(serialized);
    return serialized;
  }
  const save = draft.save;
  function check() {
    if (!validate()) return;
    setReady("The form is complete. Save it, then start the assessment.");
    requestAnimationFrame(() =>
      document
        .getElementById("validated-output")
        ?.scrollIntoView({ block: "start" }),
    );
  }
  function download() {
    const serialized = validate();
    if (!serialized) return;
    const url = URL.createObjectURL(
      new Blob([serialized], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "project.form.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Allow the browser to finish handing the blob to its download service.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <section aria-label="Project intake" className="scroll-pt-32">
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Intake</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Choose outcomes, record the facts, and attach the evidence behind
            them. Drafts can be incomplete; the assessment checks the saved form
            when it starts.
          </p>
        </div>
        <div className="sticky top-0 z-10 mb-5 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            onClick={save}
            disabled={saving}
          >
            <Save className="size-4" />
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button type="button" className={action} onClick={check}>
            Check form
          </button>
          <button
            type="button"
            className={`${action} inline-flex items-center gap-2`}
            onClick={download}
          >
            <Download className="size-4" />
            Download JSON
          </button>
          <span role="status" className="text-xs text-muted-foreground">
            {saving
              ? ""
              : unsaved
                ? "Unsaved changes"
                : savedLabel || "Not saved yet"}
          </span>
        </div>
        {saved?.error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-destructive p-3 text-sm"
          >
            {saved.error}{" "}
            {saved.conflict && (
              <Link reloadDocument to="." className="underline">
                Reload latest
              </Link>
            )}
          </p>
        )}
        {ready && (
          <p role="status" className="mb-4 text-sm text-primary">
            {ready}
          </p>
        )}
        {issues.length > 0 && (
          <div
            ref={summary}
            tabIndex={-1}
            role="alert"
            className="mb-6 rounded-xl border border-destructive p-4 outline-none"
          >
            <h2 className="font-medium">Check these answers before running</h2>
            <ul className="mt-2 list-inside list-disc text-sm">
              {issues.map((issue, index) => (
                <li key={index}>
                  {LABELS[issue.field] ?? issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <section
          className="mb-5 rounded-xl border bg-card p-5"
          aria-label="Project setup"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Currency
              <input
                aria-label="Currency"
                className={`${control} mt-2`}
                value={currency}
                maxLength={3}
                onChange={(event) => draft.setCurrency(event.target.value)}
              />
            </label>
            <div>
              <label htmlFor="horizon" className="block text-sm font-medium">
                Years to evaluate
              </label>
              <input
                id="horizon"
                className={`${control} mt-2`}
                value={horizon}
                inputMode="numeric"
                onBlur={draft.commitHorizon}
                onChange={(event) => draft.setHorizon(event.target.value)}
              />
              <button
                type="button"
                className="mt-1 text-xs underline"
                onClick={draft.acceptHorizonDefault}
              >
                Use 3 years · team assumption
              </button>
            </div>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium">
              Goals · select all that apply
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.entries(GOAL_LABELS) as [Goal, string][]).map(
                ([goal, label]) => (
                  <label
                    key={goal}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${selected.includes(goal) ? "border-primary bg-accent" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selected.includes(goal)}
                      onChange={(event) =>
                        draft.setGoals((previous: Goal[]) =>
                          event.target.checked
                            ? [...previous, goal]
                            : previous.filter((value) => value !== goal),
                        )
                      }
                    />
                    {label}
                  </label>
                ),
              )}
            </div>
          </fieldset>
        </section>
        <section
          className="mb-5 rounded-xl border bg-card p-5"
          aria-labelledby="files-heading"
        >
          <h2 id="files-heading" className="font-semibold">
            Source files
          </h2>
          <p className="my-2 text-xs text-muted-foreground">
            Files uploaded to this project. Choose the ones this assessment uses
            and describe what each holds. Upload files under Project files
            below.
          </p>
          {projectFiles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No files uploaded yet.
            </p>
          )}
          {projectFiles.map((file) => {
            const used = file.id in fileNotes;
            return (
              <div key={file.id} className="mt-3 rounded-lg border p-3">
                <label className="flex items-start gap-2 break-all text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary"
                    checked={used}
                    onChange={(event) => {
                      draft.setFileNotes((previous) => {
                        const next = { ...previous };
                        if (event.target.checked)
                          next[file.id] = file.description;
                        else delete next[file.id];
                        return next;
                      });
                    }}
                  />
                  <FileText className="mt-0.5 size-4 shrink-0" />
                  {file.name}
                </label>
                {used && (
                  <label className="mt-2 block text-xs">
                    Description (required)
                    <textarea
                      aria-label={`Description: ${file.name}`}
                      className={`${control} mt-1`}
                      value={fileNotes[file.id]}
                      onChange={(event) => {
                        draft.setFileNotes((previous) => ({
                          ...previous,
                          [file.id]: event.target.value,
                        }));
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
          {Object.keys(fileNotes)
            .filter((id) => !fileName.has(id))
            .map((id) => (
              <div
                key={id}
                className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-destructive p-3 text-sm"
              >
                <span className="break-all">
                  {id} is not a file in this project.
                </span>
                <button
                  type="button"
                  className={action}
                  onClick={() => {
                    draft.setFileNotes((previous) => {
                      const next = { ...previous };
                      delete next[id];
                      return next;
                    });
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
        </section>
        {selected.includes("time_savings") && (
          <label className="mb-4 block text-sm">
            Time-saving input method
            <select
              aria-label="Time-saving input method"
              className={`${control} mt-1 max-w-md`}
              value={paths.time}
              onChange={(event) =>
                draft.setPath("time", event.target.value as "hours" | "tasks")
              }
            >
              <option value="hours">Hours saved per person per week</option>
              <option value="tasks">
                Task minutes before/after and task frequency
              </option>
            </select>
          </label>
        )}
        {selected.includes("data_quality") && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Error input method
              <select
                aria-label="Error input method"
                className={`${control} mt-1`}
                value={paths.quality}
                onChange={(event) =>
                  draft.setPath(
                    "quality",
                    event.target.value as "counts" | "rates",
                  )
                }
              >
                <option value="counts">Annual error counts</option>
                <option value="rates">Annual volume and error rates</option>
              </select>
            </label>
            <label className="text-sm">
              Error cost method
              <select
                aria-label="Error cost method"
                className={`${control} mt-1`}
                value={paths.errorCost}
                onChange={(event) =>
                  draft.setPath(
                    "errorCost",
                    event.target.value as "direct" | "derived",
                  )
                }
              >
                <option value="direct">Cost per error</option>
                <option value="derived">Clean-unit cost and multiplier</option>
              </select>
            </label>
          </div>
        )}
        {selected.includes("risk_reduction") && (
          <label className="mb-4 block text-sm">
            Loss input method
            <select
              aria-label="Loss input method"
              className={`${control} mt-1 max-w-md`}
              value={paths.risk}
              onChange={(event) =>
                draft.setPath("risk", event.target.value as "direct" | "asset")
              }
            >
              <option value="direct">Loss per event</option>
              <option value="asset">Asset value and exposure</option>
            </select>
          </label>
        )}
        {sections.map((section) => (
          <section
            key={section.title}
            aria-label={section.title}
            className="mb-6"
          >
            <h2 className="mb-3 text-lg font-semibold">{section.title}</h2>
            <div className="grid items-start gap-3 md:grid-cols-2">
              {section.ids.map((id) => (
                <FieldEditor key={id} id={id} draft={draft} />
              ))}
            </div>
          </section>
        ))}
        <section className="mb-6 rounded-xl border bg-card p-5">
          <label htmlFor="other-notes" className="text-sm font-medium">
            Anything relevant we did not ask?
          </label>
          <textarea
            id="other-notes"
            className={`${control} mt-2`}
            rows={3}
            value={notes}
            onChange={(event) => draft.setNotes(event.target.value)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Notes provide context; they do not change numeric values
            automatically.
          </p>
        </section>
        {selected.map((goal) => (
          <details key={goal} className="mb-3 rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Measurement plan · {GOAL_LABELS[goal]}
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["metric", "How will you measure this outcome?"],
                  ["baseline", "Baseline"],
                  ["baseline_source", "Baseline source"],
                  ["owner", "Measurement owner"],
                  ["frequency", "How often?"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs">
                  {label}
                  <input
                    aria-label={`${label}: ${GOAL_LABELS[goal]}`}
                    className={`${control} mt-1`}
                    value={plans[goal]?.[key] ?? ""}
                    onChange={(event) =>
                      draft.setPlan(goal, key, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </details>
        ))}
        {json && (
          <section
            id="validated-output"
            className="mb-6 rounded-xl border bg-card p-5"
            aria-label="Validated JSON"
          >
            <h2 className="font-semibold">Validated form</h2>
            <p className="my-2 text-sm text-muted-foreground">
              Form validation passed. Calculation and confidence checks belong
              to the assessment engine.
            </p>
            <textarea
              id="form-json"
              aria-label="Validated form JSON"
              className="max-h-96 w-full overflow-auto rounded-lg border bg-muted p-4 font-mono text-xs"
              rows={16}
              value={json}
              readOnly
            />
          </section>
        )}
      </div>
    </section>
  );
}
