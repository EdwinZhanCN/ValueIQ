import { useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { FileText, Lock, Upload, X } from "lucide-react";
import type { ProjectFileItem } from "../files/project-files";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { PROJECT_DESCRIPTION } from "./intake-draft";

const MAX_BYTES = 10 * 1024 * 1024;
const DESCRIPTION_TYPES = ".pdf,.md,.docx";
const describesProject = (name: string) => /\.(pdf|md|docx)$/i.test(name);

/** Upload each file through the existing project upload route. */
async function uploadAll(
  projectId: string,
  files: File[],
  description: string,
): Promise<{ left: File[]; error: string | null }> {
  const failed: string[] = [];
  const left: File[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      failed.push(`${file.name} is over 10 MB`);
      left.push(file);
      continue;
    }
    const body = new FormData();
    body.set("file", file);
    body.set("description", description);
    const response = await fetch(`/projects/${projectId}/files`, {
      method: "POST",
      body,
    }).catch(() => null);
    if (!response?.ok) {
      failed.push(`${file.name} did not upload`);
      left.push(file);
    }
  }
  return { left, error: failed.length ? `${failed.join(". ")}.` : null };
}

function Chip({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFileItem;
}) {
  return (
    <a
      href={`/projects/${projectId}/files/${file.id}`}
      download={file.name}
      className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 font-mono text-[13px] hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{file.name}</span>
    </a>
  );
}

/**
 * The Intake step's file list (mock UI 03): a project description file, then
 * the other files grouped by the one description each upload batch shares.
 * `descriptions` is the form's view of each file's description.
 */
export function IntakeFiles({
  projectId,
  files,
  descriptions,
}: {
  projectId: string;
  files: ProjectFileItem[];
  descriptions: Record<string, string>;
}) {
  const describe = (file: ProjectFileItem) =>
    descriptions[file.id]?.trim() ? descriptions[file.id]! : file.description;
  const overview = files.filter(
    (file) => describe(file) === PROJECT_DESCRIPTION,
  );
  const groups = new Map<string, ProjectFileItem[]>();
  for (const file of files) {
    const key = describe(file);
    if (key === PROJECT_DESCRIPTION) continue;
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  return (
    <section
      id="value-files"
      tabIndex={-1}
      aria-labelledby="intake-files-heading"
      className="flex min-w-0 flex-[1.4_1_30rem] flex-col gap-5 rounded-2xl border bg-card p-5 outline-none sm:p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="intake-files-heading" className="text-sm font-semibold">
          Files
        </h2>
        <span
          title="Only project members can open them."
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground"
        >
          <Lock className="size-3.5" />
          Project only
        </span>
      </div>
      <ProjectDescription projectId={projectId} files={overview} />
      <div className="flex flex-col gap-3 border-t pt-5">
        <h3 className="text-sm font-semibold">Evidence</h3>
        {[...groups].map(([description, group]) => (
          <div
            key={description}
            className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3"
          >
            <p className="text-sm">{description}</p>
            <div className="flex flex-wrap gap-2">
              {group.map((file) => (
                <Chip key={file.id} projectId={projectId} file={file} />
              ))}
            </div>
          </div>
        ))}
        <AddGroup projectId={projectId} />
      </div>
    </section>
  );
}

function ProjectDescription({
  projectId,
  files,
}: {
  projectId: string;
  files: ProjectFileItem[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  async function pick(file: File | undefined) {
    if (!file) return;
    if (!describesProject(file.name)) {
      setError("Use a PDF, Markdown or Word (.docx) file.");
      return;
    }
    setBusy(true);
    setError((await uploadAll(projectId, [file], PROJECT_DESCRIPTION)).error);
    setBusy(false);
    if (input.current) input.current.value = "";
    void revalidator.revalidate();
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-semibold">
        Project description
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {files.map((file) => (
          <Chip key={file.id} projectId={projectId} file={file} />
        ))}
        <input
          ref={input}
          type="file"
          accept={DESCRIPTION_TYPES}
          aria-labelledby={id}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 border-dashed px-4 text-primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner className="size-4" /> : <Upload />}
          {files.length ? "Add a newer version" : "Add PDF, MD or DOCX"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function AddGroup({ projectId }: { projectId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const revalidator = useRevalidator();
  const [chosen, setChosen] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  function reset() {
    setChosen([]);
    setDescription("");
    if (input.current) input.current.value = "";
  }
  async function upload() {
    if (!description.trim()) {
      setError("Describe what these files hold.");
      return;
    }
    if (description.trim() === PROJECT_DESCRIPTION) {
      setError("Use the project description slot above for that file.");
      return;
    }
    setBusy(true);
    const { left, error } = await uploadAll(
      projectId,
      chosen,
      description.trim(),
    );
    setBusy(false);
    setError(error);
    // Keep only what did not upload, so a retry does not duplicate files.
    if (left.length) setChosen(left);
    else reset();
    void revalidator.revalidate();
  }
  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        multiple
        aria-label="Choose files"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          setChosen(Array.from(event.target.files ?? []));
          setError(null);
        }}
      />
      {chosen.length === 0 ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start border-dashed px-4 text-primary"
          onClick={() => input.current?.click()}
        >
          <Upload />
          Add files
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/50 p-3">
          <div className="flex flex-wrap gap-2">
            {chosen.map((file) => (
              <span
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border bg-background px-3 font-mono text-[13px]"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
              </span>
            ))}
          </div>
          <label htmlFor={id} className="text-sm font-medium">
            What do these files hold?
          </label>
          <Textarea
            id={id}
            rows={2}
            value={description}
            aria-invalid={error !== null && !description.trim()}
            placeholder="e.g. Weekly time logs from the reporting team, Q3"
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-10 px-4"
              disabled={busy}
              onClick={() => void upload()}
            >
              {busy ? <Spinner className="size-4" /> : <Upload />}
              Upload {chosen.length === 1 ? "file" : `${chosen.length} files`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-3"
              disabled={busy}
              onClick={reset}
            >
              <X />
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
