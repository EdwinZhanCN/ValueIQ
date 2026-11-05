/**
 * Server API for projects and their form file (interim-foundation contract 6).
 *
 * Nothing here checks access. Callers authorize first: `requireProjectAccess`
 * for anything about one project, `requireTeam` for a team's list.
 */
import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { projectForms, projects } from "../../db/schema";

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

/** Replaces the project's form file and touches the project. */
export async function saveProjectForm(
  projectId: string,
  json: unknown,
  userId: string,
): Promise<void> {
  const db = createDb(env.DB);
  const now = new Date();
  await db.batch([
    db
      .insert(projectForms)
      .values({ projectId, formJson: json, updatedBy: userId, updatedAt: now })
      .onConflictDoUpdate({
        target: projectForms.projectId,
        set: { formJson: json, updatedBy: userId, updatedAt: now },
      }),
    db
      .update(projects)
      .set({ updatedAt: now })
      .where(eq(projects.id, projectId)),
  ]);
}
