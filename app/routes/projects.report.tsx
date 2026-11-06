import { Link } from "react-router";
import { requireProjectAccess } from "../server/access.server";
import { getLatestResult, getRun } from "../server/output-runs.server";
import { listRunReports } from "../server/reports.server";
import { ReportBuilder } from "../components/output/report-builder";
import { useProjectFlow } from "./project-layout";
import type { Route } from "./+types/projects.report";

/** Step 5, Report (mock UI 07): build the report for the pinned run. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  const url = new URL(request.url);
  const runId = url.searchParams.get("run");
  const snapshot = runId
    ? await getRun(access, runId)
    : await getLatestResult(access);
  if (runId && !snapshot) throw new Response("Not found", { status: 404 });
  const output = snapshot?.output?.kind === "result" ? snapshot.output : null;
  const reports = output
    ? (await listRunReports(access, output.meta.run_id)).map((report) => ({
        id: report.id,
        createdAt: report.createdAt.toISOString(),
      }))
    : [];
  return { output, reports, savedReport: url.searchParams.get("report") };
}

export default function ProjectReport({ loaderData }: Route.ComponentProps) {
  const { output, reports, savedReport } = loaderData;
  const { project } = useProjectFlow();
  if (!output)
    return (
      <section className="flex flex-col items-start gap-4 rounded-2xl border p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">A report needs a released result</h2>
          <p className="text-sm text-muted-foreground">
            Run the assessment and review the numbers first.
          </p>
        </div>
        <Link
          to={`/projects/${project.id}/results`}
          className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85"
        >
          Go to Review
        </Link>
      </section>
    );
  return (
    <ReportBuilder
      output={output}
      project={{ id: project.id, name: project.name }}
      reports={reports}
      savedReport={savedReport}
    />
  );
}
