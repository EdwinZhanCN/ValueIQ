import { requireProjectAccess } from "../server/access.server";
import { getReportPdf } from "../server/reports.server";
import type { Route } from "./+types/project-report";
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  const pdf = await getReportPdf(access, params.runId, params.reportId);
  if (!pdf) throw new Response("Not found", { status: 404 });
  return new Response(pdf.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="valueiq-report-${encodeURIComponent(params.reportId)}.pdf"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      etag: pdf.httpEtag,
    },
  });
}
