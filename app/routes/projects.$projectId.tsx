import { ProjectFiles } from "../components/files/project-files";
import { RunAssessment } from "../components/run/run-assessment";
import { listProjectFiles } from "../server/files.server";
import { readSmallForm } from "../server/form-body.server";
import { getLatestOutcome } from "../server/run-outcome.server";
import { useEffect, useRef, useState } from "react";
import { data, Form, Link } from "react-router";
import { requireProjectAccess } from "../server/access.server";
import {
  getProject,
  getProjectForm,
  saveProjectForm,
} from "../server/projects.server";
import { StructuredIntake } from "../components/intake/structured-intake";
import {
  blankIntake,
  hydrateIntake,
  validateIntakeDraft,
} from "../lib/intake-draft";
import { validateFormFile, serializeFormFile } from "../lib/intake-form";
import type { Route } from "./+types/projects.$projectId";
const MAX_BYTES = 256 * 1024;
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireProjectAccess(request, params.projectId);
  const [project, form, files] = await Promise.all([
    getProject(params.projectId),
    getProjectForm(params.projectId),
    listProjectFiles(params.projectId),
  ]);
  if (!project) throw new Response("Not found", { status: 404 });
  const context = {
    projectId: params.projectId,
    files: files.map((file) => ({ id: file.id, projectId: params.projectId })),
  };
  const isLegacyEmpty = form && JSON.stringify(form.formJson) === "{}";
  const intake =
    !form || isLegacyEmpty
      ? blankIntake(project.goals as ReturnType<typeof blankIntake>["goals"])
      : hydrateIntake(form.formJson, context);
  const ready =
    intake !== null && validateFormFile(intake, context).length === 0;
  const latest = await getLatestOutcome(
    params.projectId,
    form?.updatedAt ?? null,
  );
  const url = new URL(request.url);
  const run = url.searchParams.get("run");
  return {
    project,
    files,
    latest,
    hasForm: ready,
    intake,
    formText: JSON.stringify(form ? form.formJson : {}, null, 2),
    savedAt: form?.updatedAt.toISOString() ?? null,
    target: url.searchParams.get("input"),
    resultUrl: `/projects/${params.projectId}/results${run ? `?run=${encodeURIComponent(run)}` : ""}`,
  };
}
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES * 2)
    throw new Response("Form too large", { status: 413 });
  const form = await readSmallForm(request);
  const raw = form.get("formJson");
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BYTES
  )
    return data(
      { error: "Form file is too large.", saved: false },
      { status: 413 },
    );
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return data({ error: "Enter valid JSON.", saved: false }, { status: 400 });
  }
  if (form.get("intakeEditor") === "structured") {
    const files = await listProjectFiles(params.projectId);
    const context = {
      projectId: params.projectId,
      files: files.map((file) => ({
        id: file.id,
        projectId: params.projectId,
      })),
    };
    const issues = validateIntakeDraft(json, context);
    if (issues.length)
      return data(
        {
          error: issues
            .map((issue) => `${issue.field}: ${issue.message}`)
            .join(" "),
          saved: false,
        },
        { status: 400 },
      );
    if (validateFormFile(json, context).length === 0) {
      const canonical = { ...(json as Record<string, unknown>) };
      delete canonical.intake_draft_version;
      json = JSON.parse(serializeFormFile(canonical, context));
    } else json = { ...(json as object), intake_draft_version: 1 };
  }
  // The version the editor loaded: "" means it loaded no saved form. Scripted
  // clients that omit the field overwrite unconditionally.
  const baseField = form.get("baseUpdatedAt");
  const base =
    typeof baseField !== "string"
      ? undefined
      : baseField === ""
        ? null
        : new Date(baseField);
  if (base && Number.isNaN(base.getTime()))
    return data(
      { error: "Reload and try again.", saved: false },
      { status: 400 },
    );
  const saved = await saveProjectForm(
    params.projectId,
    json,
    access.userId,
    base,
  );
  if (!saved.ok)
    return data(
      {
        error:
          "Someone else saved this form after you opened it. Your edits are still here: copy them, then reload to see the latest version.",
        saved: false,
        conflict: true,
      },
      { status: 409 },
    );
  return { error: null, saved: true, savedAt: saved.updatedAt.toISOString() };
}
export default function ProjectIntake({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const [unsaved, setUnsaved] = useState(false);
  const { target, formText } = loaderData;
  useEffect(() => {
    if (!target || !editor.current) return;
    const at = formText.indexOf(JSON.stringify(target));
    editor.current.focus();
    if (at >= 0) editor.current.setSelectionRange(at, at + target.length + 2);
  }, [target, formText]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link className="text-sm text-primary" to={loaderData.resultUrl}>
          ← Back to results
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">
          {loaderData.project.name}
        </h1>
      </div>
      <section aria-label="Run assessment" className="rounded-xl border p-4">
        <RunAssessment
          projectId={loaderData.project.id}
          hasForm={loaderData.hasForm && !unsaved}
          latest={loaderData.latest}
        />
      </section>
      <section id="intake" className="rounded-xl border bg-card p-6">
        {loaderData.intake ? (
          <StructuredIntake
            key={loaderData.project.id}
            project={{
              projectId: loaderData.project.id,
              initial: loaderData.intake,
              files: loaderData.files,
              savedAt: loaderData.savedAt,
              target: loaderData.target,
              onDirtyChange: setUnsaved,
            }}
          />
        ) : (
          <>
            <p role="alert">
              This saved form cannot be safely opened in the structured editor.
              The original JSON is preserved below for recovery.
            </p>
            <h2 className="mb-2 font-semibold">Saved intake · JSON preview</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This recovery editor preserves unsupported saved content. Correct
              the JSON to the supported form format to reopen structured intake.
            </p>
            {target && (
              <p className="mb-4 rounded-lg bg-accent p-3 text-sm">
                Requested input: <code>{target}</code>
              </p>
            )}
            <Form method="post" className="flex flex-col gap-4">
              <label htmlFor="formJson">Project form</label>
              <textarea
                ref={editor}
                key={loaderData.savedAt ?? "new"}
                id="formJson"
                name="formJson"
                defaultValue={formText}
                rows={18}
                spellCheck={false}
                className="w-full rounded-lg border bg-background p-4 font-mono text-xs"
              />
              <input
                type="hidden"
                name="baseUpdatedAt"
                value={loaderData.savedAt ?? ""}
              />
              {actionData?.error && (
                <p role="alert">
                  {actionData.error}{" "}
                  {"conflict" in actionData && (
                    <Link reloadDocument to=".">
                      Reload latest
                    </Link>
                  )}
                </p>
              )}
              {actionData?.saved && (
                <p role="status">
                  Intake saved. Existing results remain tied to their original
                  run.
                </p>
              )}
              <div className="flex items-center gap-4">
                <button type="submit">Save JSON</button>
                <Link to={loaderData.resultUrl}>View result</Link>
              </div>
            </Form>
            {loaderData.savedAt && (
              <p className="mt-4 text-xs text-muted-foreground">
                Saved {loaderData.savedAt}
              </p>
            )}
          </>
        )}
      </section>
      <p className="text-sm text-muted-foreground">
        Saving the intake preserves your answers. A calculation must be started
        separately; saving does not change existing results.
      </p>
      <section id="project-files" aria-label="Project evidence uploads">
        <ProjectFiles
          projectId={loaderData.project.id}
          files={loaderData.files}
        />
      </section>
    </div>
  );
}
