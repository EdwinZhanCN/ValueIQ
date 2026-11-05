/**
 * Who is signed in and which team they are working in.
 *
 * A person can belong to several teams (an owner adds an existing account by
 * email). The current team is the session's active organization when the
 * person is still a member of it, otherwise their earliest membership.
 */
import { isAPIError } from "better-auth/api";
import { asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { createDb } from "../../db/client";
import { member, organization } from "../../db/schema";
import { createAuth } from "./auth.server";
import type { TeamRole } from "./access.server";

export type Team = { id: string; name: string; role: TeamRole };

export type SignedIn = {
  user: { id: string; name: string; email: string };
  /** The team the person is working in, or null before they join one. */
  team: Team | null;
  teams: Team[];
};

/** Better Auth's message for a rejected call; anything else is rethrown. */
export function authErrorMessage(error: unknown): string {
  if (isAPIError(error)) return error.body?.message ?? error.message;
  throw error;
}

/** Only the session cookies from a Better Auth `returnHeaders` call. */
export function cookiesFrom(headers: Headers) {
  const out = new Headers();
  for (const cookie of headers.getSetCookie()) out.append("set-cookie", cookie);
  return out;
}

export async function listTeams(userId: string): Promise<Team[]> {
  const rows = await createDb(env.DB)
    .select({
      id: organization.id,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .all();
  return rows.map((row) => ({
    ...row,
    role: row.role === "owner" ? "owner" : "member",
  }));
}

export async function getSignedIn(request: Request): Promise<SignedIn | null> {
  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  });
  if (!session) return null;
  const teams = await listTeams(session.user.id);
  const active = session.session.activeOrganizationId;
  const team = teams.find((t) => t.id === active) ?? teams[0] ?? null;
  const { id, name, email } = session.user;
  return { user: { id, name, email }, team, teams };
}

function signInRedirect(request: Request) {
  const url = new URL(request.url);
  const back = url.pathname + url.search;
  return redirect(`/sign-in?redirectTo=${encodeURIComponent(back)}`);
}

/** Signed in, team or not. Signed out → `/sign-in?redirectTo=…`. */
export async function requireUser(request: Request): Promise<SignedIn> {
  const signedIn = await getSignedIn(request);
  if (!signedIn) throw signInRedirect(request);
  return signedIn;
}

/** Signed in with a team. No team yet → `/teams/new`. */
export async function requireTeam(
  request: Request,
): Promise<SignedIn & { team: Team }> {
  const signedIn = await requireUser(request);
  const { team } = signedIn;
  if (!team) throw redirect("/teams/new");
  return { ...signedIn, team };
}
