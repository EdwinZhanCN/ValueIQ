import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { createAuth } from "../server/auth.server";
import { cookiesFrom, requireUser } from "../server/team.server";
import { formText } from "~/lib/form";
import { safeRedirect } from "~/lib/redirect";
import type { Route } from "./+types/teams.active";

export function loader() {
  return redirect("/team");
}

/** Switch the session's current team (the header's team picker). */
export async function action({ request }: Route.ActionArgs) {
  const { teams } = await requireUser(request);
  const form = await request.formData();
  const teamId = formText(form, "teamId");
  if (!teams.some((t) => t.id === teamId)) {
    throw new Response("Not found", { status: 404 });
  }
  const { headers } = await createAuth(env).api.setActiveOrganization({
    body: { organizationId: teamId },
    headers: request.headers,
    returnHeaders: true,
  });
  // Project pages belong to one team, so go to the list rather than back.
  const back = safeRedirect(form.get("redirectTo"));
  const to = back?.startsWith("/projects/") ? "/projects" : (back ?? "/team");
  return redirect(to, { headers: cookiesFrom(headers) });
}
