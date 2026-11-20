import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { runReports, runs } from "../../db/schema";
import type { ProjectAccess } from "./access.server";
import { getRun } from "./output-runs.server";
import { renderReport } from "./report-renderer.server";
import {
  DEFAULT_LAYOUT,
  layoutPreset,
  storedLayout,
  type ReportLayout,
} from "../../shared/report-layout";

export async function listRunReports(access: ProjectAccess, runId: string) {
  return createDb(env.DB)
    .select({
      id: runReports.id,
      createdAt: runReports.createdAt,
      layout: runReports.layoutJson,
    })
    .from(runReports)
    .innerJoin(runs, eq(runs.id, runReports.runId))
    .where(and(eq(runs.projectId, access.projectId), eq(runs.id, runId)))
    .orderBy(desc(runReports.createdAt))
    .all()
    .then((rows) =>
      rows.map((row) => {
        const layout = storedLayout(row.layout);
        return { ...row, layout, preset: layoutPreset(layout) };
      }),
    );
}

/**
 * The browser supplies the pinned run id and a checked layout (which sections,
 * their order, which charts); every value in the PDF comes from D1.
 */
export async function saveReportPdf(
  access: ProjectAccess,
  runId: string,
  layout: ReportLayout = DEFAULT_LAYOUT,
) {
  const snapshot = await getRun(access, runId);
  if (!snapshot) throw new Response("Not found", { status: 404 });
  if (snapshot.output?.kind !== "result")
    throw new Response("A released result is required to generate a report.", {
      status: 409,
    });
  const bytes = await renderReport(snapshot.output, layout);
  if (bytes.byteLength > 10 * 1024 * 1024)
    throw new Response("The report is too large.", { status: 413 });
  const id = crypto.randomUUID();
  const key = `teams/${access.teamId}/projects/${access.projectId}/reports/${runId}/${id}.pdf`;
  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      runId,
      projectId: access.projectId,
      mode: snapshot.output.meta.mode,
      contractVersion: snapshot.output.meta.contract_version,
    },
  });
  try {
    await createDb(env.DB).insert(runReports).values({
      id,
      runId,
      r2Key: key,
      createdBy: access.userId,
      layoutJson: layout,
    });
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  return id;
}

export async function getReportPdf(
  access: ProjectAccess,
  runId: string,
  reportId: string,
) {
  const row = await createDb(env.DB)
    .select({ key: runReports.r2Key })
    .from(runReports)
    .innerJoin(runs, eq(runs.id, runReports.runId))
    .where(
      and(
        eq(runs.projectId, access.projectId),
        eq(runs.id, runId),
        eq(runReports.id, reportId),
      ),
    )
    .get();
  if (!row) return null;
  return env.FILES.get(row.key);
}
