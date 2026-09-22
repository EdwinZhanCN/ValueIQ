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
 */
export default [
  layout("routes/site-layout.tsx", [index("routes/home.tsx")]),
  layout("routes/workspace-layout.tsx", [
    route("workspace", "routes/workspace.tsx"),
  ]),
] satisfies RouteConfig;
