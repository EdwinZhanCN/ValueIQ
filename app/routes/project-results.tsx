import { Link, useRevalidator } from "react-router";
import { useEffect } from "react";
import { requireProjectAccess } from "../server/access.server";
import { getProject } from "../server/projects.server";
import { getLatestResult, getRun } from "../server/output-runs.server";
import { listRunReports } from "../server/reports.server";
import { OutputWorkspace } from "../components/output/output-workspace";
import type { Route } from "./+types/project-results";
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  const project = await getProject(params.projectId);
  if (!project) throw new Response("Not found", { status: 404 });
  const runId = new URL(request.url).searchParams.get("run");
  const snapshot = runId
    ? await getRun(access, runId)
    : await getLatestResult(access);
  if (runId && !snapshot) throw new Response("Not found", { status: 404 });
  const reports =
    snapshot?.output?.kind === "result"
      ? await listRunReports(access, snapshot.run.id)
      : [];
  return { project, snapshot, reports };
}
export default function ProjectResults({ loaderData }: Route.ComponentProps) {
  const { project, snapshot, reports } = loaderData;
  const revalidator = useRevalidator();
  const pending =
    snapshot &&
    ["running", "preflight", "blocked_on_question", "idle"].includes(
      snapshot.run.status,
    );
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      if (revalidator.state === "idle") void revalidator.revalidate();
    }, 3000);
    return () => clearInterval(interval);
  }, [pending, revalidator]);
  if (!snapshot?.output)
    return (
      <main className="mx-auto max-w-3xl p-10">
        <Link className="text-sm text-primary" to={`/projects/${project.id}`}>
          ← Saved intake
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">{project.name}</h1>
        <p className="mt-5">
          {snapshot
            ? `Run status: ${snapshot.run.status}`
            : "No engine result has been published for this project."}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Your saved intake is available. This page displays the recorded run
          status and will show its output when the workflow publishes it.
        </p>
        <button
          className="mt-5 rounded-lg border px-4 py-2"
          onClick={() => void revalidator.revalidate()}
        >
          Refresh result
        </button>
      </main>
    );
  return (
    <OutputWorkspace
      storedOutput={snapshot.output}
      project={{ id: project.id, name: project.name }}
      reports={reports.map((report) => ({
        id: report.id,
        createdAt: report.createdAt.toISOString(),
      }))}
    />
  );
}
