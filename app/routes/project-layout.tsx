import {
  Link,
  Outlet,
  useLocation,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";
import {
  ProjectSteps,
  stepFor,
  type StepState,
} from "../components/project/project-steps";
import { requireProjectAccess } from "../server/access.server";
import { runSettings } from "../server/team-settings.server";
import { listProjectFiles } from "../server/files.server";
import { getProject, getProjectForm } from "../server/projects.server";
import { getLatestOutcome } from "../server/run-outcome.server";
import { stepStates } from "../lib/project-progress";
import { factsFor, runHasReport } from "../server/project-progress.server";
import type { Route } from "./+types/project-layout";

/**
 * The assessment flow shell for one project (mock UI screens 03–07):
 * breadcrumb, the step title, and the Intake → Clarify → Process → Review →
 * Report bar. Each step is its own child route. Child loaders still call
 * `requireProjectAccess` themselves; shared data is read with
 * `useProjectFlow()`.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  const [project, form, files] = await Promise.all([
    getProject(params.projectId),
    getProjectForm(params.projectId),
    listProjectFiles(params.projectId),
  ]);
  if (!project) throw new Response("Not found", { status: 404 });
  const { version: settingsNow } = await runSettings(access.teamId, new Date());
  const latest = await getLatestOutcome(
    params.projectId,
    form?.updatedAt ?? null,
    settingsNow,
  );
  const facts = factsFor({
    projectId: params.projectId,
    formJson: form?.formJson ?? null,
    fileIds: files.map((file) => file.id),
    latest: latest
      ? { status: latest.status, hasReport: await runHasReport(latest.runId) }
      : null,
    processing: false,
  });
  const complete = facts.complete;
  const done: Record<string, StepState> = stepStates(facts);
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
  // Review and Report show one run; keep it when moving between them.
  const [search] = useSearchParams();
  const runId = search.get("run");
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
            runId={runId}
          />
        </div>
      </header>
      <Outlet />
    </div>
  );
}
