import { redirect } from "react-router";
import { requireProjectAccess } from "../server/access.server";
import { saveReportPdf } from "../server/reports.server";
import { parseReportLayout } from "../../shared/report-layout";
import type { Route } from "./+types/project-reports";
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  if (request.method !== "POST")
    throw new Response("Method not allowed", { status: 405 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
  // Optional layout fields; absent means the standard layout. A bad id or an
  // empty section list is refused before anything is rendered or stored.
  // A POST with no body (older callers) also gets the standard layout.
  const form = request.headers.get("content-type")
    ? await request.formData().catch(() => {
        throw new Response("The report request could not be read.", {
          status: 400,
        });
      })
    : null;
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : null;
  };
  const parsed = parseReportLayout({
    version: field("version"),
    preset: field("preset"),
    sections: field("sections"),
    charts: field("charts"),
    title: field("title"),
    preparedFor: field("preparedFor"),
    preparedBy: field("preparedBy"),
  });
  if (!parsed.ok) throw new Response(parsed.error, { status: 400 });
  const id = await saveReportPdf(access, params.runId, parsed.layout);
  return redirect(
    `/projects/${params.projectId}/report?${new URLSearchParams({ run: params.runId, report: id })}`,
  );
}
