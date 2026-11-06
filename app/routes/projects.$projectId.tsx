import { ProjectFiles } from "../components/files/project-files";
import { RunAssessment } from "../components/run/run-assessment";
import { listProjectFiles } from "../server/files.server";
import { readSmallForm } from "../server/form-body.server";
import { getLatestOutcome } from "../server/run-outcome.server";
import { data, Link } from "react-router";
import { StructuredIntake } from "../components/intake/structured-intake";
import { requireProjectAccess } from "../server/access.server";
import {
  getProject,
  getProjectForm,
  saveProjectForm,
} from "../server/projects.server";
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
    hasForm: form !== null,
    form: form?.formJson ?? null,
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
  return { error: null, saved: true };
}
export default function ProjectIntake({ loaderData }: Route.ComponentProps) {
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
          hasForm={loaderData.hasForm}
          latest={loaderData.latest}
        />
      </section>
      <div id="intake">
        <StructuredIntake
          projectId={loaderData.project.id}
          initial={loaderData.form}
          savedAt={loaderData.savedAt}
          projectFiles={loaderData.files}
          target={loaderData.target}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Saving the intake preserves your answers. A calculation must be started
        separately; saving does not change existing results.
      </p>
      <ProjectFiles
        projectId={loaderData.project.id}
        files={loaderData.files}
      />
    </div>
  );
}
