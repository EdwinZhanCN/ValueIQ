import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Database,
  FileText,
  FolderOpen,
  Shield,
  Target,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";

const goals = [
  { id: "time_savings", label: "Time savings", icon: Clock3 },
  { id: "data_quality", label: "Data quality", icon: Database },
  { id: "decision_speed", label: "Decision speed", icon: Zap },
  { id: "risk_reduction", label: "Risk reduction", icon: Shield },
] as const;

type FileGroup = { id: number; files: File[]; description: string };
// Temporary UI limits until the upload contract (#55 / Q7) lands.
const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const field =
  "w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const panel = "rounded-xl border bg-card p-5 sm:p-6";

export function IntakeForm() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [decision, setDecision] = useState("");
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [fileError, setFileError] = useState("");
  const [goalError, setGoalError] = useState(false);
  const [review, setReview] = useState(false);
  const goalRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const count =
    groups.reduce((sum, group) => sum + group.files.length, 0) +
    (projectFile ? 1 : 0);

  function validateFiles(files: File[], existing: number) {
    if (files.some((file) => file.size === 0 || file.size > MAX_BYTES)) {
      setFileError(
        "Choose non-empty files of 10 MB or less. Your previous selection was kept.",
      );
      return false;
    }
    if (existing + files.length > MAX_FILES) {
      setFileError(
        "You can select up to 10 files in total. Remove a file or choose fewer files.",
      );
      return false;
    }
    setFileError("");
    return true;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) {
      setGoalError(true);
      goalRef.current?.focus();
      return;
    }
    setReview(true);
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-48 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-10 flex items-center gap-2 font-semibold">
          <Target className="size-5 text-primary" />
          ValueIQ
        </Link>
        <div className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">
          <FolderOpen className="mr-2 inline size-4" />
          New project
        </div>
        <p className="mt-auto text-xs leading-5 text-muted-foreground">
          Intake preview
          <br />
          Files stay in this tab.
        </p>
      </aside>
      <main
        className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8"
        aria-label="Project intake"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Workspace / New project</span>
            <span className="rounded-full border px-3 py-1">
              Local preview · not saved
            </span>
          </div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              {review ? "Review intake" : "Intake"}
            </h1>
            <ol
              aria-label="Assessment steps"
              className="flex flex-wrap gap-4 text-xs text-muted-foreground"
            >
              {["Intake", "Clarify", "Process", "Review", "Report"].map(
                (step, index) => (
                  <li
                    key={step}
                    aria-current={index === 0 ? "step" : undefined}
                    className={index === 0 ? "font-semibold text-primary" : ""}
                  >
                    <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full border">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          </div>
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
            Describe your project, choose the outcomes that matter, and add the
            files that explain your starting point.
          </p>
          {review ? (
            <section className={panel} aria-labelledby="review-title">
              <h2 id="review-title" className="text-lg font-semibold">
                {name.trim()}
              </h2>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Goals</dt>
                  <dd>
                    {goals
                      .filter((goal) => selected.includes(goal.id))
                      .map((goal) => goal.label)
                      .join(", ")}
                  </dd>
                </div>
                {decision.trim() && (
                  <div>
                    <dt className="text-muted-foreground">Decision</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {decision.trim()}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">
                    Project description file
                  </dt>
                  <dd className="break-all">
                    {projectFile?.name ?? "None selected"}
                  </dd>
                </div>
                {groups.map((group) => (
                  <div key={group.id}>
                    <dt className="break-all text-muted-foreground">
                      {group.files.map((file) => file.name).join(", ")}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {group.description.trim()}
                    </dd>
                  </div>
                ))}
              </dl>
              <p role="status" className="mt-6 rounded-lg bg-muted p-4 text-sm">
                Intake checked locally. Nothing has been uploaded or saved.
                Saving and continuing to the assistant will be available when
                the form and project services are connected.
              </p>
              <button
                type="button"
                onClick={() => setReview(false)}
                className="mt-5 rounded-lg border px-4 py-2 text-sm"
              >
                Back to editing
              </button>
            </section>
          ) : (
            <form onSubmit={submit}>
              <div className="grid items-start gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <section className={panel} aria-label="Project details">
                  <label
                    htmlFor="project-name"
                    className="mb-2 block text-sm font-medium"
                  >
                    Project name{" "}
                    <span className="text-muted-foreground">(required)</span>
                  </label>
                  <input
                    id="project-name"
                    name="project_name"
                    required
                    maxLength={120}
                    pattern=".*\S.*"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={field}
                    placeholder="e.g. Replenishment automation"
                  />
                  <fieldset
                    className="mt-6"
                    aria-describedby={goalError ? "goal-error" : "goal-hint"}
                  >
                    <legend className="text-sm font-medium">
                      Goals (required)
                    </legend>
                    <p
                      id="goal-hint"
                      className="mb-3 mt-1 text-xs text-muted-foreground"
                    >
                      Select all that apply.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {goals.map(({ id, label, icon: Icon }, index) => (
                        <label
                          key={id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring ${selected.includes(id) ? "border-primary bg-accent text-accent-foreground" : ""}`}
                        >
                          <input
                            ref={index === 0 ? goalRef : undefined}
                            type="checkbox"
                            name="goals"
                            value={id}
                            checked={selected.includes(id)}
                            aria-invalid={goalError || undefined}
                            onChange={(event) => {
                              setSelected((previous) =>
                                event.target.checked
                                  ? [...previous, id]
                                  : previous.filter((goal) => goal !== id),
                              );
                              setGoalError(false);
                            }}
                            className="accent-primary"
                          />
                          <Icon className="size-4 shrink-0" />
                          {label}
                        </label>
                      ))}
                    </div>
                    {goalError && (
                      <p
                        id="goal-error"
                        role="alert"
                        className="mt-2 text-sm text-destructive"
                      >
                        Choose at least one goal.
                      </p>
                    )}
                  </fieldset>
                  <label
                    htmlFor="decision"
                    className="mb-2 mt-6 block text-sm font-medium"
                  >
                    Decision{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    id="decision"
                    name="decision_statement"
                    maxLength={500}
                    rows={3}
                    value={decision}
                    onChange={(event) => setDecision(event.target.value)}
                    className={field}
                    placeholder="Should we automate the weekly reporting process?"
                  />
                </section>
                <section className={panel} aria-labelledby="files-title">
                  <h2 id="files-title" className="text-sm font-semibold">
                    Files
                  </h2>
                  <p
                    id="file-limits"
                    className="mb-5 mt-1 text-xs leading-5 text-muted-foreground"
                  >
                    Local selection only. Temporary limit: 10 files total, 10 MB
                    each. Files are not read or uploaded.
                  </p>
                  <label
                    htmlFor="project-file"
                    className="mb-2 block text-sm font-medium"
                  >
                    Project description file{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <p
                    id="project-file-hint"
                    className="mb-3 text-xs text-muted-foreground"
                  >
                    Describe the proposed project in a PDF, Markdown, or Word
                    document.
                  </p>
                  <input
                    id="project-file"
                    type="file"
                    accept=".pdf,.md,.docx"
                    aria-describedby="project-file-hint file-limits file-error"
                    className={field}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (!/\.(pdf|md|docx)$/i.test(file.name)) {
                        setFileError(
                          "Project descriptions must be PDF, MD, or DOCX files.",
                        );
                        return;
                      }
                      if (validateFiles([file], count - (projectFile ? 1 : 0)))
                        setProjectFile(file);
                    }}
                  />
                  {projectFile && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
                      <FileText className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 break-all">
                        {projectFile.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${projectFile.name}`}
                        onClick={() => setProjectFile(null)}
                        className="rounded p-2 hover:bg-background"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                  <div className="mb-3 mt-6 border-t pt-5">
                    <h3 className="text-sm font-medium">
                      Data files{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select related files together. Add one description for
                      each group.
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-primary focus-within:ring-2 focus-within:ring-ring">
                    <Upload className="size-4" />
                    Add a file group
                    <input
                      aria-label="Add data files"
                      type="file"
                      multiple
                      aria-describedby="file-limits file-error"
                      className="sr-only"
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = "";
                        if (files.length && validateFiles(files, count))
                          setGroups((previous) => [
                            ...previous,
                            { id: nextId.current++, files, description: "" },
                          ]);
                      }}
                    />
                  </label>
                  {groups.map((group, index) => (
                    <fieldset
                      key={group.id}
                      className="mt-4 rounded-lg border p-4"
                    >
                      <legend className="px-1 text-xs font-medium">
                        File group {index + 1}
                      </legend>
                      <ul className="mb-3 space-y-2 text-sm">
                        {group.files.map((file, fileIndex) => (
                          <li
                            key={fileIndex}
                            className="flex items-center gap-2"
                          >
                            <FileText className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 break-all">
                              {file.name}{" "}
                              <span className="text-xs text-muted-foreground">
                                ({Math.ceil(file.size / 1024)} KB)
                              </span>
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove ${file.name} from group ${index + 1}`}
                              className="rounded p-2 hover:bg-muted"
                              onClick={() =>
                                setGroups((previous) =>
                                  previous
                                    .map((item) =>
                                      item.id === group.id
                                        ? {
                                            ...item,
                                            files: item.files.filter(
                                              (_, i) => i !== fileIndex,
                                            ),
                                          }
                                        : item,
                                    )
                                    .filter((item) => item.files.length),
                                )
                              }
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label
                        htmlFor={`description-${group.id}`}
                        className="mb-2 block text-sm"
                      >
                        Description (required)
                      </label>
                      <textarea
                        id={`description-${group.id}`}
                        required
                        maxLength={2000}
                        rows={3}
                        value={group.description}
                        onChange={(event) =>
                          setGroups((previous) =>
                            previous.map((item) =>
                              item.id === group.id
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          )
                        }
                        onBlur={(event) =>
                          event.target.setCustomValidity(
                            event.target.value.trim()
                              ? ""
                              : "Describe what these files contain.",
                          )
                        }
                        onInput={(event) =>
                          event.currentTarget.setCustomValidity(
                            event.currentTarget.value.trim()
                              ? ""
                              : "Describe what these files contain.",
                          )
                        }
                        placeholder="What do these files contain, and how do they relate to the project?"
                        className={field}
                      />
                    </fieldset>
                  ))}
                  <p
                    id="file-error"
                    role="alert"
                    className="mt-3 text-sm text-destructive"
                  >
                    {fileError}
                  </p>
                </section>
              </div>
              <div className="mt-5 flex items-center justify-between gap-4">
                <Link
                  to="/"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <ArrowLeft className="size-4" />
                  Back
                </Link>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Review intake
                  <ArrowRight className="size-4" />
                </button>
              </div>
              <p className="mt-4 text-right text-xs text-muted-foreground">
                This draft clears when you leave or refresh the page.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
