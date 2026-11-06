/**
 * Server API for projects and their form file (interim-foundation contract 6).
 *
 * Nothing here checks access. Callers authorize first: `requireProjectAccess`
 * for anything about one project, `requireTeam` for a team's list.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { projectForms, projects } from "../../db/schema";

// Contract 6 lists the file reads here too; they live in files.server.ts.
export { listProjectFiles, readProjectFile } from "./files.server";

export type ProjectSummary = {
  id: string;
  name: string;
  goals: string[];
  updatedAt: Date;
};

export type ProjectForm = {
  formJson: unknown;
  updatedBy: string;
  updatedAt: Date;
};

const summary = {
  id: projects.id,
  name: projects.name,
  goals: projects.goals,
  updatedAt: projects.updatedAt,
};

export async function listTeamProjects(
  teamId: string,
): Promise<ProjectSummary[]> {
  return createDb(env.DB)
    .select(summary)
    .from(projects)
    .where(eq(projects.teamId, teamId))
    .orderBy(desc(projects.updatedAt))
    .all();
}

export async function createProject(input: {
  teamId: string;
  userId: string;
  name: string;
  goals: string[];
}): Promise<string> {
  const id = crypto.randomUUID();
  await createDb(env.DB).insert(projects).values({
    id,
    teamId: input.teamId,
    name: input.name,
    goals: input.goals,
    createdBy: input.userId,
  });
  return id;
}

export async function getProject(
  projectId: string,
): Promise<ProjectSummary | undefined> {
  return createDb(env.DB)
    .select(summary)
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
}

/** The saved form file, or null before the first save. Its shape is Ag1. */
export async function getProjectForm(
  projectId: string,
): Promise<ProjectForm | null> {
  const row = await createDb(env.DB)
    .select({
      formJson: projectForms.formJson,
      updatedBy: projectForms.updatedBy,
      updatedAt: projectForms.updatedAt,
    })
    .from(projectForms)
    .where(eq(projectForms.projectId, projectId))
    .get();
  return row ?? null;
}

export type SaveFormResult =
  { ok: true; updatedAt: Date } | { ok: false; reason: "stale" };

const isGoalList = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((g) => typeof g === "string");

/**
 * Saves the project's form file and touches the project.
 *
 * `base` is the `updatedAt` the editor loaded (`null`: it loaded no saved
 * form). When given, the save only lands if nobody saved since; otherwise it
 * returns `stale` and changes nothing (an edit conflict, as on Wikipedia).
 * Omit it for an unconditional overwrite.
 *
 * The form is authoritative for goals: a form with a `goals` list also sets
 * `projects.goals`, in the same batch and only if the form write landed.
 */
export async function saveProjectForm(
  projectId: string,
  json: unknown,
  userId: string,
  base?: Date | null,
): Promise<SaveFormResult> {
  const db = createDb(env.DB);
  const now = new Date();
  const values = { formJson: json, updatedBy: userId, updatedAt: now };
  const id = { projectId: projectForms.projectId };
  const insert = db.insert(projectForms).values({ projectId, ...values });
  const write =
    base === undefined
      ? insert
          .onConflictDoUpdate({ target: projectForms.projectId, set: values })
          .returning(id)
      : base === null
        ? insert.onConflictDoNothing().returning(id)
        : db
            .update(projectForms)
            .set(values)
            .where(
              and(
                eq(projectForms.projectId, projectId),
                eq(projectForms.updatedAt, base),
              ),
            )
            .returning(id);
  const goals = (json as { goals?: unknown } | null)?.goals;
  // Runs after the form write in the same transaction; matches nothing when
  // that write was skipped as stale.
  const landed = sql`exists (select 1 from ${projectForms} where ${projectForms.projectId} = ${projectId} and ${projectForms.updatedAt} = ${now.getTime()} and ${projectForms.updatedBy} = ${userId})`;
  const [written] = await db.batch([
    write,
    db
      .update(projects)
      .set(isGoalList(goals) ? { goals, updatedAt: now } : { updatedAt: now })
      .where(and(eq(projects.id, projectId), landed)),
  ]);
  return written.length > 0
    ? { ok: true, updatedAt: now }
    : { ok: false, reason: "stale" };
}
