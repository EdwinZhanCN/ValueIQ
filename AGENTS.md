# ValueIQ agent guide

Human setup and deployment commands live in [README.md](README.md).

## Start here

- Read [architecture](docs/architecture.md) before changing UI/server, agent, or storage boundaries.
- Read [core beliefs](docs/core-beliefs.md) when changing assessment behavior or product scope.
- Read the research plan for your own area in [docs/research/plans](docs/research/plans/README.md) (read the README, then only your file: input `01`, AI assistant `02`, calculation engine `03`, output `04`, infrastructure `05`). It is research context to review and build from, not a spec; `docs/research/ROI.md` and `SOURCES.md` back it.
- Read only relevant unfinished plans in [.agents/exec-plans/active](.agents/exec-plans/active/README.md). Never read or cite `.agents/exec-plans/archive/`; it is human reference only.

## Repository map

- `app/`: React Router routes, the two surface layouts, and the UI under `components/`.
- `workers/app.ts`: Worker entry: routes `/agents/*` through the agent gate, then hands everything else to React Router. Exports `ValueIQAgent` and the `CalculationRun` workflow.
- `agents/`: `valueiq-agent.ts` exposes access-checked run RPC/state; `calculation-run.ts` executes the orchestrator through `RUN_WORKFLOW`. Preserve the merged live integration.
- `shared/output.ts`: version 1 output validation; `engine/` owns deterministic calculation and output types; `assistant/` contains the pushed orchestration library. Worker wiring is implemented; the output UI still needs a user-facing Start Run control.
- `shared/types.ts`: the cross-track types from the integration contract (run states, `RunView`, `Question`).
- `db/`, `drizzle/`: Drizzle client, Better Auth tables (`auth-schema.ts`, generated from `auth.cli.ts`), application tables (`schema.ts`), and their migrations.
- `app/server/`: Better Auth (`auth.server.ts`), the project access rule (`access.server.ts`), the signed-in user and current team (`team.server.ts`), the project API (`projects.server.ts`), project files in R2 (`files.server.ts`), calculation runs (`runs.server.ts`), and the agent gate (`agent-gate.server.ts`).
- `docs/`: [architecture](docs/architecture.md) and [core beliefs](docs/core-beliefs.md).
- `.agents/`: coding-agent procedures and durable project memory.

## Implementation boundaries

- The marketing pages are `/` (landing) and `/workspace` (mock workspace), and neither has a loader or an action. `/api/auth/*` serves Better Auth.
- Account pages: `/sign-up`, `/sign-in`, `/sign-out` (`auth-layout`), and `/teams/new`, `/team` inside the signed-in shell `app/routes/app-layout.tsx`. `app/server/team.server.ts` gives loaders the signed-in user and current team (`requireUser`, `requireTeam`).
- Project pages: `/projects` and `/projects/new` inside `app-layout`. Each project is a step flow in `app/routes/project-layout.tsx` (breadcrumb + step bar, data via `useProjectFlow()`): Intake `/projects/:projectId`, Clarify `/clarify`, Process `/process`, Review `/results`, Report `/report`. Step pages save the form through POST `/projects/:projectId/form` (`app/server/form-save.server.ts`, edit-conflict check).
- `/projects/:projectId/results` and its private report resources read validated pinned engine outputs. `app/server/output-runs.server.ts` handles consumer snapshots; `runs.server.ts` retains canonical infrastructure signatures. `finishRun` accepts a complete validated envelope, never a client result payload.
- Every loader, action, and resource route that touches a project calls `requireProjectAccess` first, and gets a row in `scripts/access-matrix.mjs`.
- Agent routes (`/agents/value-i-q-agent/{projectId}`) pass `agentGate` first: 401 signed out, 404 other team or missing project, 403 cross-site; on success the agent reads the caller from `x-valueiq-user-id`, never from the client. They are covered in `scripts/access-matrix.mjs`.
- Cross-track types live in `shared/types.ts` and change only through a pull request to the integration contract. Agent state, tools, and skill conventions follow that contract; nothing in the agent or workflow may present a stub as a real assessment. New tables follow the active exec plans.
- The pre-integration Input form contract is `shared/form.ts`, with its serializer/validator in `app/lib/intake-form.ts` and field rules in `app/lib/intake-catalog.ts`. `pnpm fixtures:forms` generates the engine handoff; `pnpm test:forms` checks accepted and rejected cases. Intake/Clarify saves validate the version-1 draft using authorized file IDs and keep strict canonical validation for complete exports; see `engine/fixtures/forms/README.md` for remaining spec/type mismatches.
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
