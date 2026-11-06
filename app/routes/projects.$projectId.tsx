import { ProjectFiles } from "../components/files/project-files";
import { listProjectFiles } from "../server/files.server";
import { readSmallForm } from "../server/form-body.server";
import { useEffect, useRef } from "react";
import { data, Form, Link } from "react-router";
import { requireProjectAccess } from "../server/access.server";
import {
  getProject,
  getProjectForm,
  saveProjectForm,
} from "../server/projects.server";
import { SubmitButton } from "../components/submit-button";
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
  const url = new URL(request.url);
  const run = url.searchParams.get("run");
  return {
    project,
    files,
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
  await saveProjectForm(params.projectId, json, access.userId);
  return { error: null, saved: true };
}
export default function ProjectIntake({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const editor = useRef<HTMLTextAreaElement>(null);
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
      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-2 font-semibold">Saved intake · JSON preview</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The structured intake form is being built by the input team. This
          editor loads and saves the actual project form without changing its
          shape.
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
          {actionData?.error && <p role="alert">{actionData.error}</p>}
          {actionData?.saved && (
            <p role="status">
              Intake saved. Existing results remain tied to their original run.
            </p>
          )}
          <div className="flex items-center gap-4">
            <SubmitButton>Save intake</SubmitButton>
            <Link to={loaderData.resultUrl}>View result</Link>
          </div>
        </Form>
        {loaderData.savedAt && (
          <p className="mt-4 text-xs text-muted-foreground">
            Saved {loaderData.savedAt}
          </p>
        )}
      </section>
      <p className="text-sm text-muted-foreground">
        The executable engine is not connected yet. Saving the intake does not
        start or fabricate a calculation.
      </p>
      <ProjectFiles projectId={loaderData.project.id} files={loaderData.files} />
    </div>
  );
}
