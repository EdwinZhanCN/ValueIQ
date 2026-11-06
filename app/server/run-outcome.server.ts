/**
 * The project's latest saved outcome, reduced to display text for the project
 * page. Callers authorize first (`requireProjectAccess`). Only formatted text
 * leaves the server: the full result JSON stays in D1 for the results page.
 */
import { summarizeOutput, type LatestOutcome } from "../lib/run-ui";
import { getLatestResult } from "./runs.server";

export async function getLatestOutcome(
  projectId: string,
  formUpdatedAt: Date | null,
): Promise<LatestOutcome | null> {
  const latest = await getLatestResult(projectId);
  if (!latest) return null;
  const { run } = latest;
  if (run.status !== "released" && run.status !== "gap_list") return null;
  const stored = run.status === "released" ? latest.result : latest.gapList;
  return {
    runId: run.id,
    status: run.status,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    formChangedSince: Boolean(
      formUpdatedAt && run.finishedAt && formUpdatedAt > run.finishedAt,
    ),
    summary: summarizeOutput(stored),
  };
}
