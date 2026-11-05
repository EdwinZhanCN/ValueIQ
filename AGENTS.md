# ValueIQ agent guide

Human setup and deployment commands live in [README.md](README.md).

## Start here

- Read [architecture](docs/architecture.md) before changing UI/server, agent, or storage boundaries.
- Read [core beliefs](docs/core-beliefs.md) when changing assessment behavior or product scope.
- Read the research plan for your own area in [docs/research/plans](docs/research/plans/README.md) (read the README, then only your file: input `01`, AI assistant `02`, calculation engine `03`, output `04`, infrastructure `05`). It is research context to review and build from, not a spec; `docs/research/ROI.md` and `SOURCES.md` back it.
- Read only relevant unfinished plans in [.agents/exec-plans/active](.agents/exec-plans/active/README.md). Never read or cite `.agents/exec-plans/archive/`; it is human reference only.

## Repository map

- `app/`: React Router routes, the two surface layouts, and the UI under `components/`.
- `workers/app.ts`: Worker entry and the `ValueIQAgent` Durable Object export.
- `agents/valueiq-agent.ts`: empty agent shell — no state, no tools, no methods.
- `db/`, `drizzle/`: Drizzle client, Better Auth tables (`auth-schema.ts`, generated from `auth.cli.ts`), application tables (`schema.ts`), and their migrations.
- `app/server/`: Better Auth (`auth.server.ts`), the project access rule (`access.server.ts`), and the signed-in user and current team (`team.server.ts`).
- `docs/`: [architecture](docs/architecture.md) and [core beliefs](docs/core-beliefs.md).
- `.agents/`: coding-agent procedures and durable project memory.

## Implementation boundaries

- The marketing pages are `/` (landing) and `/workspace` (mock workspace), and neither has a loader or an action. `/api/auth/*` serves Better Auth.
- Account pages: `/sign-up`, `/sign-in`, `/sign-out` (`auth-layout`), and `/teams/new`, `/team` inside the signed-in shell `app/routes/app-layout.tsx`. `app/server/team.server.ts` gives loaders the signed-in user and current team (`requireUser`, `requireTeam`).
- Every loader, action, and resource route that touches a project calls `requireProjectAccess` first.
- Keep the agent shell empty: do not add agent state, tools, skill conventions, or domain types until that design is actually decided. New tables follow the active exec plans.
- Never present mock or scripted behaviour as a working assessment.
- `worker-configuration.d.ts` and `.react-router/types/` are generated and ignored; use `pnpm typegen` rather than hand-editing them.
- Generate migrations from `db/schema.ts` with `pnpm db:generate`. Review generated SQL and retain applied migrations unchanged.
- Keep runtime database and agent access in `.server.ts` modules or loaders/actions. The SSR build checks the client/server bundle boundary.

## Verification

Use [valueiq-select-checks](.agents/skills/valueiq-select-checks/SKILL.md) before claiming verification or preparing changes for review; it routes each changed area to actual checks.

## Durable memory

- [Decisions](.agents/decisions/README.md) preserve rationale and rejected alternatives.
- [Postmortems](.agents/postmortems/README.md) cover escaped systemic failures and link implemented guardrails.
- [Execution plans](.agents/exec-plans/README.md) exist only while multi-phase work remains unfinished.
