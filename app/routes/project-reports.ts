import { redirect } from "react-router";
import { requireProjectAccess } from "../server/access.server";
import { saveReportPdf } from "../server/reports.server";
import type { Route } from "./+types/project-reports";
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  if (request.method !== "POST")
    throw new Response("Method not allowed", { status: 405 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
  const id = await saveReportPdf(access, params.runId);
  return redirect(
    `/projects/${params.projectId}/results?run=${params.runId}&tab=report&report=${id}`,
  );
}
