# Architecture

ValueIQ has account/team/project pages, private file storage, a deterministic engine/assistant library, and persisted results with private R2 PDF reports. The engine is integrated as a pure library and tested against the output consumer. The merged Worker agent/workflow invoke the live orchestrator and publish validated D1 outcomes. The project flow starts runs from the Process step and reads their outcomes on Review. See [output pipeline](output-pipeline.md) for server methods and remaining orchestration work. The Input team's form wire type and serializer/validator (`shared/form.ts`, `app/lib/intake-form.ts`) back the Intake and Clarify steps, which save the project form; `startRun` refuses a form that does not validate.

## Stack

| Layer      | Choice and wiring                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | React Router v8 in framework mode: `app/routes.ts`, route modules, SSR through `app/entry.server.tsx`                                             |
| Runtime    | Cloudflare Workers through the Cloudflare Vite plugin; `workers/app.ts` is the fetch entry                                                        |
| Data       | D1 through Drizzle ORM: `db/client.ts`, `db/schema.ts`, and the `DB` binding in `wrangler.jsonc`                                                  |
| Identity   | Better Auth (email/password, organization plugin) on D1: `app/server/auth.server.ts`, endpoints at `/api/auth/*`; a team is an organization       |
| Agent      | Cloudflare Agents SDK: the `ValueIQAgent` Durable Object (one per project) behind `agentGate`, and the `CalculationRun` workflow (`RUN_WORKFLOW`) |
| Styling    | Tailwind CSS v4 with design tokens in `app/styles.css`                                                                                            |
| Components | Vendored shadcn/ui on Base UI primitives (`app/components/ui/`), beUI motion (`app/components/motion/`), Lucide icons, Geist through Fontsource   |
| Checks     | `typegen`, `typecheck`, `lint`, `format:check`, `build`, `deploy:check`, `test:smoke`                                                             |

## Surfaces

| Route                        | Layout                                                | Contents                                                                                    |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/`                          | `app/routes/site-layout.tsx`                          | Landing page sections from `app/components/landing/`, wrapped in the site header and footer |
| `/workspace`                 | `app/routes/workspace-layout.tsx`                     | Labeled STUB output preview; chat example at `?view=chat`                                   |
| `/sign-up`, `/sign-in`       | `app/routes/auth-layout.tsx`                          | One centred form; `redirectTo` is honoured only for same-site paths                         |
| `/teams/new`, `/team`        | `app/routes/app-layout.tsx`                           | The signed-in shell: sidebar with the current team, nav, and the account row                |
| `/projects`, `/projects/new` | `app/routes/app-layout.tsx`                           | The current team's projects and the new-project form                                        |
| `/projects/:projectId/*`     | `app/routes/project-layout.tsx` (inside `app-layout`) | The assessment steps: Intake, `clarify`, `process`, `results` (Review), `report`            |

Signed-in screens follow the [Mock UI](mock-ui/README.md) (screens 01–10 with owner notes; 08 and 09 are cut for Beta).

`app/root.tsx` renders the document only: html/body, theme provider, tooltip provider, and the grain overlay. Page chrome belongs to the surface layouts, and error pages bring their own frame.

Neither marketing surface has a loader or an action. `/api/auth/*` is a resource route with no page. `/workspace` renders supplied STUB outputs without server calls. `/projects/:projectId/results` renders inside the project step layout and loads a pinned/latest stored outcome after project access checks. Private report resource routes generate/download a PDF from that immutable snapshot.

## Identity, data, and access

- `db/auth-schema.ts` — Better Auth's tables, generated from `auth.cli.ts`. Keep that file's options in step with `app/server/auth.server.ts`.
- `db/schema.ts` — `projects`, `project_forms` (the form file, stored opaquely), `files` (upload metadata; the objects go in R2), and `team_settings` (append-only team defaults), per the [interim-foundation plan](../.agents/exec-plans/active/interim-foundation.md).
- `app/server/team.server.ts` — the signed-in user and their current team (the session's active organization if still a member, else the earliest membership). `requireUser` redirects to `/sign-in?redirectTo=…`; `requireTeam` also redirects a person with no team to `/teams/new`. After sign-in a person lands on `/projects`, or `/teams/new` without a team. "Add people" on `/team` is an owner-only action that adds an existing account by email through `auth.api.addMember`; no email is sent.
- `app/server/access.server.ts` — the one project access rule. `checkProjectAccess(request, projectId)` returns `{ userId, teamId, projectId, role }`, `signed_out`, or `forbidden`; `requireProjectAccess` throws a redirect to `/sign-in` or a 404. A missing project and another team's project both answer 404. Every loader, action, and resource route that touches a project calls it.
- `app/server/projects.server.ts` — the project API for other tracks (`getProjectForm`, `saveProjectForm`, plus list/create/get). It checks nothing; callers authorize first.
- `app/server/files.server.ts` — uploads in the private `FILES` R2 bucket under `teams/{teamId}/projects/{projectId}/files/{fileId}`, with their `files` rows; 10 MB per file. `/projects/:projectId/files` (upload action) and `/projects/:projectId/files/:fileId` (download) stream through the Worker after the access check; there is no public bucket URL. `app/components/files/project-files.tsx` is the upload form and file list a project page mounts.

`/projects/:projectId` shows the saved form file as plain JSON, labelled as a placeholder until the Input team's intake form mounts there.

The fixture generator also covers the 19 second-wave input cases. `scripts/form-wave2-cases.ts` constructs typed submissions independently of the pinned reference forms; `scripts/form-wave2.test.ts` compares complete serializer output against each reference. This adds input coverage without changing runtime/UI behavior.

## Runs and the agent gate

The Input team's pre-integration wire type is `shared/form.ts`. `app/lib/intake-form.ts` owns serialization, parsing, field/evidence validation and preserving accepted state on rejected edits; it imports no engine or storage code. `pnpm fixtures:forms` produces deterministic engine handoff files from typed form state, including explicit rejected candidates for negative tests. `pnpm test:forms` runs the boundary checks and detects stale generated fixtures. The Intake step (goals, decision, files) and the Clarify step (numbers, defaults, evidence) edit this form as a lenient draft (`readFormDraft`); `validateFormFile` decides completeness before Process. [Fixture handoff and compatibility notes](../engine/fixtures/forms/README.md) record differences from the old research skeleton and #127 proposal.

- `shared/types.ts` — run states, `RunView`, and `Question` from the [integration contract](../.agents/exec-plans/active/integration-contract.md) section 3.
- `db/schema.ts` — `runs`, `run_events` (append-only, `seq` from the agent), `run_questions`, and `run_results` (CHECK: a result or a gap list, never both).
- `app/server/runs.server.ts` — `createRun`, `getRun`, `updateRunStatus`, `appendRunEvent`, `recordRunQuestion`, `answerRunQuestion`, `finishRun`, `getLatestResult`. No access checks of their own; callers authorize first.
- `app/server/output-runs.server.ts` — validated project-scoped snapshots; latest pending/failed runs never show an older headline.
- `app/server/reports.server.ts` — fixed-template Worker PDF generation, private R2 objects and `run_reports` metadata. The browser supplies run identity, never financial data.
- `shared/output.ts` — version 1 runtime output validator; `engine/types.ts` owns the calculation types.
- `app/server/agent-gate.server.ts` — `agentGate`, run by `routeAgentRequest` as both `onBeforeConnect` and `onBeforeRequest`. It allows only `ValueIQAgent`, refuses a cross-site `Origin` (403), answers 401/404 from `checkProjectAccess`, and forwards the request with `x-valueiq-user-id` replaced by the caller's id. `getProjectMembership(projectId, userId)` (in `access.server.ts`) is the re-check for agent methods that change a run.

## Run execution

- `agents/valueiq-agent.ts` — per-project run state and access-checked preflight/start/cancel RPC. Mid-run questions return NOT_SUPPORTED.
- `agents/calculation-run.ts` — workflow steps check access and invoke the orchestrator with retry/backoff; results use the canonical run API.
- `app/context.server.ts` — typed Worker bindings for loaders and actions.

`app/server/run-store.server.ts` adapts the orchestrator to canonical D1 APIs. `run-wiring.server.ts` loads saved forms and Worker secrets. No mock replaces a missing model key.

## Runtime and generated artifacts

`pnpm dev` uses the Cloudflare Vite plugin to execute SSR and bindings in local workerd. D1 and Durable Object data persist under ignored `.wrangler/state/`. `pnpm build` produces client assets and a server Worker with a generated Wrangler deployment configuration. `pnpm deploy:check` packages that build without publishing it.

`wrangler.jsonc` owns binding declarations: the `DB` D1 database, the `FILES` R2 bucket (`valueiq-dev-files`, `valueiq-prod-files`, simulated locally), the `ValueIQAgent` Durable Object, and the `RUN_WORKFLOW` workflow (`valueiq-run`, `valueiq-dev-run`, `valueiq-prod-run`), plus each environment's `AUTH_ALLOWED_HOSTS` and `BETTER_AUTH_SECRET`. The merged development configuration also requires `GEMINI_API_KEY`; production needs that key before live model runs are enabled. `pnpm typegen` generates runtime/binding types and React Router route types. Drizzle generates migration SQL and snapshots from `db/schema.ts`; Wrangler applies the SQL. The default configuration is local. Named `development` and `production` environments declare separate Workers, D1 databases, and Durable Object bindings. Their D1 databases are provisioned in the maintainer’s Cloudflare account, and their non-secret IDs are committed in `wrangler.jsonc`. Deployment rejects placeholder IDs and shared databases. Checks run without credentials. [Development and release guide](deployment.md) documents the live environments, access controls, and ongoing release workflow.

The assistant includes a Gemini adapter invoked by the Worker workflow. Local automated verification uses fakes or the explicit missing-key error path; it makes no live model calls. There are no MCP integrations, queues, or separate backend. People sign up, create a team, and add teammates through the account pages.

## Verification boundaries

The [check-selection skill](../.agents/skills/valueiq-select-checks/SKILL.md) owns command routing. `pnpm test:engine` covers engine and assistant library behavior; `pnpm test:output` covers validation/immutable publication, and `pnpm test:output:runtime` covers persisted forms/results/private PDFs on a local Worker. The smoke test starts the real local Worker and checks that the landing page renders with the site chrome, that the workspace renders fullscreen without it, that sign-up returns a session, that two accounts in two teams work through the account pages (an owner adds a member by email, a member is refused, sign-in honours only same-site `redirectTo`), and that `/projects` asks a signed-out visitor to sign in and opens for a signed-in owner. The access matrix (`pnpm test:access`) signs up an owner, a member, and an outsider and checks each project route as them and signed out. The build and deployment dry run check Worker packaging and the Durable Object binding.

Two boundaries are review-enforced: the interface stays separate from anything backend-shaped, and an empty shell stays empty until its design is decided. A page, a loader, or a mock must not start implying a design that has not been made.
