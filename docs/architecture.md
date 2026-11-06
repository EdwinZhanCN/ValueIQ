# Architecture

ValueIQ has account/team pages, persisted projects and opaque saved forms, a validated engine-output consumer, and private PDF generation/storage. The executable calculation engine has not been pushed; project pages show an honest empty or pending state until trusted server code publishes a run. The agent remains an empty shell. See the [output pipeline](output-pipeline.md) for implemented server interfaces and remaining integration work.

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
| `/workspace`           | `app/routes/workspace-layout.tsx` | Labeled STUB output preview; vendored chat example at `?view=chat`                          |
| `/sign-up`, `/sign-in` | `app/routes/auth-layout.tsx`      | One centred form; `redirectTo` is honoured only for same-site paths                         |
| `/teams/new`, `/team`  | `app/routes/app-layout.tsx`       | The signed-in shell: header with the current team, nav, and sign-out                        |

`app/root.tsx` renders the document only: html/body, theme provider, tooltip provider, and the grain overlay. Page chrome belongs to the surface layouts, and error pages bring their own frame.

Neither marketing surface has a loader or an action. `/api/auth/*` is a resource route with no page. `/workspace` renders supplied STUB samples. Protected `/projects`, `/projects/new` and `/projects/:projectId` list/create projects and edit saved opaque JSON. `/projects/:projectId/results` loads a pinned or latest persisted run; its report resources generate PDFs and stream private R2 objects. These routes call the shared access gate first. The structured intake editor and executable engine remain pending.

## Identity, data, and access

- `db/auth-schema.ts` — Better Auth's tables, generated from `auth.cli.ts`. Keep that file's options in step with `app/server/auth.server.ts`.
- `db/schema.ts` — `projects`, `project_forms` (the form file, stored opaquely), `files` (upload metadata; the objects go in R2), and `team_settings` (append-only team defaults), per the [interim-foundation plan](../.agents/exec-plans/active/interim-foundation.md).
- `app/server/team.server.ts` — the signed-in user and their current team (the session's active organization if still a member, else the earliest membership). `requireUser` redirects to `/sign-in?redirectTo=…`; `requireTeam` also redirects a person with no team to `/teams/new`. After sign-in a person lands on `/projects`, or `/teams/new` without a team. "Add people" on `/team` is an owner-only action that adds an existing account by email through `auth.api.addMember`; no email is sent.
- `app/server/access.server.ts` — the one project access rule. `checkProjectAccess(request, projectId)` returns `{ userId, teamId, projectId, role }`, `signed_out`, or `forbidden`; `requireProjectAccess` throws a redirect to `/sign-in` or a 404. A missing project and another team's project both answer 404. Every loader, action, and resource route that touches a project calls it.

## Empty shells

- `agents/valueiq-agent.ts` — an empty `ValueIQAgent` Durable Object: no state shape, no tools, no RPC methods.
- `app/context.server.ts` — typed Worker bindings for loaders and actions.

Pending: agent state, agent tools, application skill conventions and executable orchestration. `shared/output.ts` now validates the supplied version 1 engine envelope; runtime consumers and storage share it. The output migration proposes `runs`, `run_results` and `run_reports` from the integration plan. Infrastructure and engine owners still review this concrete handoff before merge.

## Runtime and generated artifacts

`pnpm dev` uses the Cloudflare Vite plugin to execute SSR and bindings in local workerd. D1 and Durable Object data persist under ignored `.wrangler/state/`. `pnpm build` produces client assets and a server Worker with a generated Wrangler deployment configuration. `pnpm deploy:check` packages that build without publishing it.

`wrangler.jsonc` owns binding declarations: the `DB` D1 database and the `ValueIQAgent` Durable Object, the private `FILES` R2 bucket, plus each environment's `AUTH_ALLOWED_HOSTS` variable and required `BETTER_AUTH_SECRET` secret. `pnpm typegen` generates runtime/binding types and React Router route types. Drizzle generates migration SQL and snapshots from `db/schema.ts`; Wrangler applies the SQL. The default configuration is local. Named `development` and `production` environments declare separate Workers, D1 databases, and Durable Object bindings. Their D1 databases are provisioned in the maintainer’s Cloudflare account, and their non-secret IDs are committed in `wrangler.jsonc`. Deployment rejects placeholder IDs and shared databases. Checks run without credentials. [Development and release guide](deployment.md) documents the live environments, access controls, and ongoing release workflow.

There are no model secrets, outbound model calls, MCP integrations, queues, or separate backend. People sign up, create a team, and add teammates through the account pages.

## Verification boundaries

The [check-selection skill](../.agents/skills/valueiq-select-checks/SKILL.md) routes static, contract, local workerd, migration, browser and deployment-package checks. `pnpm test:output` validates the output contract and immutable publication. `pnpm test:smoke` checks both public surfaces and account/team/project access. `pnpm test:output:integration`, with a separately running local Worker, checks saved forms, persisted run states, access isolation and private R2 reports using explicitly STUB test data. No test invokes a real engine yet.

Database and R2 access stay in server-only modules. Browsers never submit trusted results; report generation reads the selected stored snapshot. Missing, pending, gap and invalid outcomes cannot fall back to a sample or old headline. Editing intake preserves historical results and reports. The runtime database, migrations and R2 behavior have local checks; remote deployment and executable engine integration are separate work.
