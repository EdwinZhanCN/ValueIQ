/**
 * Progress for every project of one team, in a fixed number of queries (not
 * one round per project): forms, file ids, finished runs with whether they
 * have a report, and runs still calculating. Callers authorize the team first
 * (`requireTeam`); every query is scoped through `projects.team_id`.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import {
  files,
  projectForms,
  projects,
  runReports,
  runs,
} from "../../db/schema";
import { readFormDraft, validateFormFile } from "../lib/intake-form";
import {
  currentStep,
  projectStatus,
  type ProgressFacts,
  type ProjectStatus,
} from "../lib/project-progress";

export interface ProjectProgress {
  id: string;
  name: string;
  goals: string[];
  updatedAt: Date;
  status: ProjectStatus;
  processing: boolean;
  step: { label: string; position: number };
}

const ACTIVE = ["preflight", "running", "blocked_on_question"] as const;

/** The facts `project-progress.ts` needs, from the rows of one project. */
export function factsFor(input: {
  projectId: string;
  formJson: unknown;
  fileIds: string[];
  latest: { status: "released" | "gap_list"; hasReport: boolean } | null;
  processing: boolean;
}): ProgressFacts {
  const draft = readFormDraft(input.formJson ?? null);
  const complete =
    input.formJson !== null &&
    input.formJson !== undefined &&
    validateFormFile(input.formJson, {
      projectId: input.projectId,
      files: input.fileIds.map((id) => ({ id, projectId: input.projectId })),
    }).length === 0;
  return {
    hasGoals: draft.goals.length > 0,
    complete,
    latest: input.latest,
    processing: input.processing,
  };
}

export async function listTeamProgress(
  teamId: string,
): Promise<ProjectProgress[]> {
  const db = createDb(env.DB);
  const inTeam = eq(projects.teamId, teamId);
  const [list, forms, fileRows, finished, reported, active] = await Promise.all(
    [
      db
        .select({
          id: projects.id,
          name: projects.name,
          goals: projects.goals,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(inTeam)
        .orderBy(desc(projects.updatedAt))
        .all(),
      db
        .select({
          projectId: projectForms.projectId,
          formJson: projectForms.formJson,
        })
        .from(projectForms)
        .innerJoin(projects, eq(projects.id, projectForms.projectId))
        .where(inTeam)
        .all(),
      db
        .select({ projectId: files.projectId, id: files.id })
        .from(files)
        .innerJoin(projects, eq(projects.id, files.projectId))
        .where(inTeam)
        .all(),
      // Newest first, so the first row per project is its latest finished run.
      db
        .select({
          id: runs.id,
          projectId: runs.projectId,
          status: runs.status,
        })
        .from(runs)
        .innerJoin(projects, eq(projects.id, runs.projectId))
        .where(and(inTeam, inArray(runs.status, ["released", "gap_list"])))
        .orderBy(desc(runs.finishedAt))
        .all(),
      db
        .selectDistinct({ runId: runReports.runId })
        .from(runReports)
        .innerJoin(runs, eq(runs.id, runReports.runId))
        .innerJoin(projects, eq(projects.id, runs.projectId))
        .where(inTeam)
        .all(),
      db
        .selectDistinct({ projectId: runs.projectId })
        .from(runs)
        .innerJoin(projects, eq(projects.id, runs.projectId))
        .where(and(inTeam, inArray(runs.status, [...ACTIVE])))
        .all(),
    ],
  );

  const formOf = new Map(forms.map((f) => [f.projectId, f.formJson]));
  const filesOf = new Map<string, string[]>();
  for (const row of fileRows)
    filesOf.set(row.projectId, [...(filesOf.get(row.projectId) ?? []), row.id]);
  const latestOf = new Map<string, { id: string; status: string }>();
  for (const run of finished)
    if (!latestOf.has(run.projectId)) latestOf.set(run.projectId, run);
  const withReport = new Set(reported.map((r) => r.runId));
  const busy = new Set(active.map((r) => r.projectId));

  return list.map((project) => {
    const latest = latestOf.get(project.id);
    const facts = factsFor({
      projectId: project.id,
      formJson: formOf.get(project.id) ?? null,
      fileIds: filesOf.get(project.id) ?? [],
      latest: latest
        ? {
            status: latest.status as "released" | "gap_list",
            hasReport: withReport.has(latest.id),
          }
        : null,
      processing: busy.has(project.id),
    });
    const step = currentStep(facts);
    return {
      ...project,
      status: projectStatus(facts),
      processing: facts.processing,
      step: { label: step.label, position: step.position },
    };
  });
}

/** Whether a run has at least one saved PDF report. */
export async function runHasReport(runId: string): Promise<boolean> {
  const row = await createDb(env.DB)
    .select({ id: runReports.id })
    .from(runReports)
    .where(eq(runReports.runId, runId))
    .get();
  return Boolean(row);
}
