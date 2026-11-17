import { requireProjectAccess } from "../server/access.server";
import { attachmentDisposition } from "../server/files.server";
import { reportFilename } from "../lib/report-filename";
import { getProject } from "../server/projects.server";
import { getReportPdf } from "../server/reports.server";
import type { Route } from "./+types/project-report";
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  const pdf = await getReportPdf(access, params.runId, params.reportId);
  if (!pdf) throw new Response("Not found", { status: 404 });
  const project = await getProject(access.projectId);
  if (!project) throw new Response("Not found", { status: 404 });
  return new Response(pdf.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": attachmentDisposition(
        reportFilename(project.name),
      ),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      etag: pdf.httpEtag,
    },
  });
}
