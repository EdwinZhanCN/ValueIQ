import { Link, Outlet, useLocation, useRouteLoaderData } from "react-router";
import {
  ProjectSteps,
  stepFor,
  type StepState,
} from "../components/project/project-steps";
import { requireProjectAccess } from "../server/access.server";
import { listProjectFiles } from "../server/files.server";
import { getProject, getProjectForm } from "../server/projects.server";
import { getLatestOutcome } from "../server/run-outcome.server";
import { readFormDraft, validateFormFile } from "../lib/intake-form";
import type { Route } from "./+types/project-layout";

/**
 * The assessment flow shell for one project (mock UI screens 03–07):
 * breadcrumb, the step title, and the Intake → Clarify → Process → Review →
 * Report bar. Each step is its own child route. Child loaders still call
 * `requireProjectAccess` themselves; shared data is read with
 * `useProjectFlow()`.
 */
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
  const draft = readFormDraft(form?.formJson ?? null);
  const complete =
    form !== null &&
    validateFormFile(form.formJson, {
      projectId: params.projectId,
      files: files.map((file) => ({
        id: file.id,
        projectId: params.projectId,
      })),
    }).length === 0;
  const done: Record<string, StepState> = {
    intake: draft.goals.length > 0 ? "done" : "todo",
    clarify: complete ? "done" : "todo",
    process: latest ? "done" : "todo",
    review: latest?.status === "released" ? "done" : "todo",
    report: "todo",
  };
  return {
    project,
    form: form?.formJson ?? null,
    savedAt: form?.updatedAt.toISOString() ?? null,
    files,
    latest,
    complete,
    done,
  };
}

export type ProjectFlow = Awaited<ReturnType<typeof loader>>;

/** The layout's data, for any step page inside the project flow. */
export function useProjectFlow(): ProjectFlow {
  const data = useRouteLoaderData<typeof loader>("routes/project-layout");
  if (!data) throw new Error("useProjectFlow outside the project layout");
  return data;
}

export default function ProjectLayout({ loaderData }: Route.ComponentProps) {
  const { project, done } = loaderData;
  const { pathname } = useLocation();
  const current = stepFor(pathname, project.id);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link to="/projects" className="hover:text-foreground">
            Projects
          </Link>{" "}
          / <span className="text-foreground">{project.name}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-heading text-2xl font-medium">{current.label}</h1>
          <ProjectSteps
            projectId={project.id}
            current={current.key}
            done={done}
          />
        </div>
      </header>
      <Outlet />
    </div>
  );
}
