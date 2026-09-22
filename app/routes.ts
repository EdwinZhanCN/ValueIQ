import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

/**
 * Two surfaces, deliberately separated:
 *
 * - `/`          marketing surface — the landing page, with the site chrome.
 * - `/workspace` assessment surface — the workspace at full size, with no site
 *                chrome, so nothing competes with the project conversation.
 */
export default [
  layout("routes/site-layout.tsx", [index("routes/home.tsx")]),
  layout("routes/workspace-layout.tsx", [
    route("workspace", "routes/workspace.tsx"),
  ]),
] satisfies RouteConfig;
