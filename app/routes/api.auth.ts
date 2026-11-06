import { cloudflareContext } from "../context.server";
import { createAuth } from "../server/auth.server";
import type { Route } from "./+types/api.auth";

export function loader({ request, context }: Route.LoaderArgs) {
  return createAuth(context.get(cloudflareContext).env).handler(request);
}

export function action({ request, context }: Route.ActionArgs) {
  return createAuth(context.get(cloudflareContext).env).handler(request);
}
