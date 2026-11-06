import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { DownloadIcon, FileIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";

/** Mirrors `ProjectFileSummary` in `app/server/files.server.ts`. */
export type ProjectFileItem = {
  id: string;
  name: string;
  mime: string;
  size: number;
  description: string;
  uploadedAt: Date | string;
};

type UploadResult =
  | { ok: true }
  | {
      ok: false;
      error: "missing_file" | "missing_description" | "too_large";
    };

const errors = {
  missing_file: "Choose a file.",
  missing_description: "Describe the file.",
  too_large: "Files are limited to 10 MB.",
} as const;

/**
 * Upload form plus file list for a project page. The page loader supplies
 * `files` (from `listProjectFiles`); a successful upload revalidates it.
 */
export function ProjectFiles({
  projectId,
  files,
}: {
  projectId: string;
  files: ProjectFileItem[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <FileUpload projectId={projectId} />
      <FileList projectId={projectId} files={files} />
    </div>
  );
}

export function FileUpload({ projectId }: { projectId: string }) {
  const fetcher = useFetcher<UploadResult>();
  const form = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) form.current?.reset();
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      ref={form}
      method="post"
      encType="multipart/form-data"
      action={`/projects/${projectId}/files`}
      className="flex flex-col gap-3"
    >
      <Field data-invalid={error === "missing_file" || error === "too_large"}>
        <FieldLabel htmlFor="project-file">File</FieldLabel>
        <Input id="project-file" name="file" type="file" required />
      </Field>
      <Field data-invalid={error === "missing_description"}>
        <FieldLabel htmlFor="project-file-description">Description</FieldLabel>
        <Textarea
          id="project-file-description"
          name="description"
          required
          rows={2}
        />
      </Field>
      {error ? <FieldError>{errors[error]}</FieldError> : null}
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? <Spinner className="size-4" /> : null}
        Upload
      </Button>
    </fetcher.Form>
  );
}

export function FileList({
  projectId,
  files,
}: {
  projectId: string;
  files: ProjectFileItem[];
}) {
  if (files.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileIcon />
          </EmptyMedia>
          <EmptyTitle>No files</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {files.map((file) => (
        <li key={file.id} className="flex items-start gap-3 p-3">
          <FileIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-medium">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatSize(file.size)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{file.description}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={
              <a
                href={`/projects/${projectId}/files/${file.id}`}
                download={file.name}
                aria-label={`Download ${file.name}`}
              />
            }
          >
            <DownloadIcon />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
