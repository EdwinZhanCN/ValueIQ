# Architecture

ValueIQ is a technology-stack skeleton for a project value assessment product. What exists is the chosen stack, wired end to end, plus two interface surfaces. Identity and the first tables are in place (Better Auth, teams, projects, form files, uploads, team settings); the account and project pages use them. A shared form wire type and independent form serializer/validator support pre-integration engine fixtures; they are not connected to the intake UI or saved projects. There is still no agent state or agent tools. Nothing in the repository pretends otherwise.

## Stack

| Layer      | Choice and wiring                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | React Router v8 in framework mode: `app/routes.ts`, route modules, SSR through `app/entry.server.tsx`                                           |
| Runtime    | Cloudflare Workers through the Cloudflare Vite plugin; `workers/app.ts` is the fetch entry                                                      |
| Data       | D1 through Drizzle ORM: `db/client.ts`, `db/schema.ts`, and the `DB` binding in `wrangler.jsonc`                                                |
| Identity   | Better Auth (email/password, organization plugin) on D1: `app/server/auth.server.ts`, endpoints at `/api/auth/*`; a team is an organization     |
| Agent      | Cloudflare Agents SDK: the `ValueIQAgent` Durable Object class, exported from `workers/app.ts`                                                  |
| Styling    | Tailwind CSS v4 with design tokens in `app/styles.css`                                                                                          |
| Components | Vendored shadcn/ui on Base UI primitives (`app/components/ui/`), beUI motion (`app/components/motion/`), Lucide icons, Geist through Fontsource |
| Checks     | `typegen`, `typecheck`, `lint`, `format:check`, `build`, `deploy:check`, `test:smoke`                                                           |

## Surfaces

| Route                  | Layout                            | Contents                                                                                    |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `/`                    | `app/routes/site-layout.tsx`      | Landing page sections from `app/components/landing/`, wrapped in the site header and footer |
| `/workspace`           | `app/routes/workspace-layout.tsx` | The interface skeleton from `app/components/agents/`, given the whole viewport              |
| `/sign-up`, `/sign-in` | `app/routes/auth-layout.tsx`      | One centred form; `redirectTo` is honoured only for same-site paths                         |
| `/teams/new`, `/team`  | `app/routes/app-layout.tsx`       | The signed-in shell: header with the current team, nav, and sign-out                        |
| `/projects/*`          | `app/routes/app-layout.tsx`       | The current team's projects, a new-project form, and a project page with its form file      |

`app/root.tsx` renders the document only: html/body, theme provider, tooltip provider, and the grain overlay. Page chrome belongs to the surface layouts, and error pages bring their own frame.

Neither marketing surface has a loader or an action. `/api/auth/*` is a resource route with no page. `/workspace` renders example content owned by vendored components; it is a mock interface, not a working assessment, and it calls nothing.

## Identity, data, and access

- `db/auth-schema.ts` — Better Auth's tables, generated from `auth.cli.ts`. Keep that file's options in step with `app/server/auth.server.ts`.
- `db/schema.ts` — `projects`, `project_forms` (the form file, stored opaquely), `files` (upload metadata; the objects go in R2), and `team_settings` (append-only team defaults), per the [interim-foundation plan](../.agents/exec-plans/active/interim-foundation.md).
- `app/server/team.server.ts` — the signed-in user and their current team (the session's active organization if still a member, else the earliest membership). `requireUser` redirects to `/sign-in?redirectTo=…`; `requireTeam` also redirects a person with no team to `/teams/new`. After sign-in a person lands on `/projects`, or `/teams/new` without a team. "Add people" on `/team` is an owner-only action that adds an existing account by email through `auth.api.addMember`; no email is sent.
- `app/server/access.server.ts` — the one project access rule. `checkProjectAccess(request, projectId)` returns `{ userId, teamId, projectId, role }`, `signed_out`, or `forbidden`; `requireProjectAccess` throws a redirect to `/sign-in` or a 404. A missing project and another team's project both answer 404. Every loader, action, and resource route that touches a project calls it.
- `app/server/projects.server.ts` — the project API for other tracks (`getProjectForm`, `saveProjectForm`, plus list/create/get). It checks nothing; callers authorize first.
- `app/server/files.server.ts` — uploads in the private `FILES` R2 bucket under `teams/{teamId}/projects/{projectId}/files/{fileId}`, with their `files` rows; 10 MB per file. `/projects/:projectId/files` (upload action) and `/projects/:projectId/files/:fileId` (download) stream through the Worker after the access check; there is no public bucket URL. `app/components/files/project-files.tsx` is the upload form and file list a project page mounts.

`/projects/:projectId` shows the saved form file as plain JSON, labelled as a placeholder until the Input team's intake form mounts there.

## Empty shells

The Input team's pre-integration wire type is `shared/form.ts`. `app/lib/intake-form.ts` owns serialization, parsing, field/evidence validation and preserving accepted state on rejected edits; it imports no engine or storage code. `pnpm fixtures:forms` produces deterministic engine handoff files from typed form state, including explicit rejected candidates for negative tests. `pnpm test:forms` runs the boundary checks and detects stale generated fixtures. The existing project JSON placeholder and intake UI are not connected to this numerical form model yet. [Fixture handoff and compatibility notes](../engine/fixtures/forms/README.md) record differences from the old research skeleton and #127 proposal; these shared form types are the narrow exception to the remaining undecided domain contracts below.

- `agents/valueiq-agent.ts` — an empty `ValueIQAgent` Durable Object: no state shape, no tools, no RPC methods.
- `app/context.server.ts` — typed Worker bindings for loaders and actions.

Undecided on purpose: agent state, agent tools, application skill conventions, and additional shared domain types beyond the form handoff above. Add them when the design is settled and reconnect a surface to them deliberately.

## Runtime and generated artifacts

`pnpm dev` uses the Cloudflare Vite plugin to execute SSR and bindings in local workerd. D1 and Durable Object data persist under ignored `.wrangler/state/`. `pnpm build` produces client assets and a server Worker with a generated Wrangler deployment configuration. `pnpm deploy:check` packages that build without publishing it.

`wrangler.jsonc` owns binding declarations: the `DB` D1 database, the `FILES` R2 bucket (`valueiq-dev-files`, `valueiq-prod-files`, simulated locally), and the `ValueIQAgent` Durable Object, plus each environment's `AUTH_ALLOWED_HOSTS` variable and required `BETTER_AUTH_SECRET` secret. `pnpm typegen` generates runtime/binding types and React Router route types. Drizzle generates migration SQL and snapshots from `db/schema.ts`; Wrangler applies the SQL. The default configuration is local. Named `development` and `production` environments declare separate Workers, D1 databases, and Durable Object bindings. Their D1 databases are provisioned in the maintainer’s Cloudflare account, and their non-secret IDs are committed in `wrangler.jsonc`. Deployment rejects placeholder IDs and shared databases. Checks run without credentials. [Development and release guide](deployment.md) documents the live environments, access controls, and ongoing release workflow.

There are no model secrets, outbound model calls, MCP integrations, queues, or separate backend. People sign up, create a team, and add teammates through the account pages.

## Verification boundaries

The [check-selection skill](../.agents/skills/valueiq-select-checks/SKILL.md) owns command routing. There are no unit tests while the repository holds no calculation contracts. The smoke test starts the real local Worker and checks that the landing page renders with the site chrome, that the workspace renders fullscreen without it, that sign-up returns a session, that two accounts in two teams work through the account pages (an owner adds a member by email, a member is refused, sign-in honours only same-site `redirectTo`), and that `/projects` asks a signed-out visitor to sign in and opens for a signed-in owner. The access matrix (`pnpm test:access`) signs up an owner, a member, and an outsider and checks each project route as them and signed out. The build and deployment dry run check Worker packaging and the Durable Object binding.

Two boundaries are review-enforced: the interface stays separate from anything backend-shaped, and an empty shell stays empty until its design is decided. A page, a loader, or a mock must not start implying a design that has not been made.
