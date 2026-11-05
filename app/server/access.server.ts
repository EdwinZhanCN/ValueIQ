/**
 * The project access rule (interim-foundation contract 2).
 *
 * A caller may touch a project only when signed in and a member of the
 * project's team. Roles are `owner | member` and carry the same project
 * access (Q13). A missing project and another team's project look the same.
 */
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { createDb } from "../../db/client";
import { member, projects } from "../../db/schema";
import { createAuth } from "./auth.server";

export type TeamRole = "owner" | "member";

export type ProjectAccess = {
  userId: string;
  teamId: string;
  projectId: string;
  role: TeamRole;
};

export type ProjectAccessResult = ProjectAccess | "signed_out" | "forbidden";

/** The core check, with no response building. The agent gate calls this. */
export async function checkProjectAccess(
  request: Request,
  projectId: string,
): Promise<ProjectAccessResult> {
  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  });
  if (!session) return "signed_out";

  const row = await createDb(env.DB)
    .select({ teamId: projects.teamId, role: member.role })
    .from(projects)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, projects.teamId),
        eq(member.userId, session.user.id),
      ),
    )
    .where(eq(projects.id, projectId))
    .get();
  if (!row) return "forbidden";

  return {
    userId: session.user.id,
    teamId: row.teamId,
    projectId,
    role: row.role === "owner" ? "owner" : "member",
  };
}

/**
 * For loaders, actions, and resource routes. Throws a redirect to `/sign-in`
 * when signed out and a 404 for any other team.
 */
export async function requireProjectAccess(
  request: Request,
  projectId: string,
): Promise<ProjectAccess> {
  const access = await checkProjectAccess(request, projectId);
  if (access === "signed_out") {
    const url = new URL(request.url);
    const back = url.pathname + url.search;
    throw redirect(`/sign-in?redirectTo=${encodeURIComponent(back)}`);
  }
  if (access === "forbidden") {
    throw new Response("Not found", { status: 404 });
  }
  return access;
}
