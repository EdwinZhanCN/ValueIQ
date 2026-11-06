import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { createAuth } from "../server/auth.server";
import { cookiesFrom } from "../server/team.server";
import type { Route } from "./+types/sign-out";

// Sign-out is a POST (the header's form); a stray GET just goes home.
export function loader() {
  return redirect("/");
}

export async function action({ request }: Route.ActionArgs) {
  const { headers } = await createAuth(env).api.signOut({
    headers: request.headers,
    returnHeaders: true,
  });
  return redirect("/", { headers: cookiesFrom(headers) });
}
