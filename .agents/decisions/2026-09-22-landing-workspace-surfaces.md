# Decision: Separate landing and workspace surfaces, with the UI disconnected from the backend

Status: implemented

## Problem

The scaffold rendered every page inside one shell: the root layout carried the site header and footer, and the project/assessment pages were marketing-wrapped cards. The workspace interface — the example chat that shows what the product will look like — could therefore never occupy the viewport, and the public site's chrome leaked into the application.

At the same time the interface is not the product yet. Skills, tool orchestration, structured input promotion, and result persistence are unbuilt, so the project and assessment pages only exercised the agent and D1 plumbing.

## Decision

The application exposes two routes and two surface layouts:

- `app/routes/site-layout.tsx` wraps `/` in the site header and footer (marketing shell).
- `app/routes/workspace-layout.tsx` gives `/workspace` the whole viewport with no site chrome (application shell).

The root layout renders the document only, so error pages bring their own frame, and neither surface has a loader or an action: the workspace renders the interface skeleton, and no form posts to the server. The Worker bindings and the agent class stay wired; the application design they used to carry was removed later in [A tech-stack shell, not an application design](2026-09-22-tech-stack-shell.md). The former `/projects`, `/projects/:projectId`, and `/assessments/:assessmentId` page modules are no longer routed. `pnpm test:smoke` proves both surfaces render and that `/projects` is not served.

## Alternatives considered

**Hiding chrome per route with a `handle` flag in the shared root layout** — rejected because it keeps one shell guessing which surface it is in. Two explicit layouts make the boundary structural: a new route must choose a surface, and the marketing chrome cannot leak back into the application by accident.

**Keeping the project/assessment pages mounted but unlinked** — rejected because they would keep a second, server-backed UI path alive whose behavior contradict the interface-first direction, and their loaders would keep the UI coupled to the agent and D1.

**Deleting the agent, D1 schema, migrations, and calculation tools along with the pages** — rejected here, because this decision is only about which surface owns page chrome. A later record, [A tech-stack shell, not an application design](2026-09-22-tech-stack-shell.md), did remove the application design for its own reason: none of it had been decided.
