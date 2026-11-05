import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

/**
 * Two surfaces, deliberately separated:
 *
 * - `/`         marketing shell — the landing page, with the site chrome.
 * - `/workspace` application shell — the example UI at full size, with no
 *               site chrome and no server data: the UI is disconnected from
 *               the project/assessment backend on purpose.
 * - `/api/auth/*` Better Auth's endpoints (sign-up, sign-in, sessions, teams).
 */
export default [
  route("api/auth/*", "routes/api.auth.ts"),
  layout("routes/site-layout.tsx", [index("routes/home.tsx")]),
  layout("routes/workspace-layout.tsx", [
    route("workspace", "routes/workspace.tsx"),
  ]),
  // Z1: accounts and teams. `app-layout` is the signed-in shell.
  layout("routes/auth-layout.tsx", [
    route("sign-in", "routes/sign-in.tsx"),
    route("sign-up", "routes/sign-up.tsx"),
  ]),
  route("sign-out", "routes/sign-out.ts"),
  route("teams/active", "routes/teams.active.ts"),
  layout("routes/app-layout.tsx", [
    route("teams/new", "routes/teams.new.tsx"),
    route("team", "routes/team.tsx"),
  ]),
] satisfies RouteConfig;
