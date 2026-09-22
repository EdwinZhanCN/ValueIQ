# ValueIQ agent guide

Human setup commands live in [README.md](README.md); the contributor workflow lives in [CONTRIBUTING.md](CONTRIBUTING.md).

## Start here

- Read [architecture](docs/architecture.md) before changing UI/server, agent, or storage boundaries.
- Read [core beliefs](docs/core-beliefs.md) when changing assessment behavior or product scope.
- Read only relevant unfinished plans in [.agents/exec-plans/active](.agents/exec-plans/active/README.md).

## Repository map

- `app/`: React Router routes, the two surface layouts, and the UI under `components/`.
- `workers/app.ts`: Worker entry and the `ValueIQAgent` Durable Object export.
- `agents/valueiq-agent.ts`: empty agent shell — no state, no tools, no methods.
- `db/`, `drizzle/`: Drizzle client and schema entry point; no tables and no migrations yet.
- `docs/`: [architecture](docs/architecture.md) and [core beliefs](docs/core-beliefs.md).
- `.agents/`: coding-agent procedures and durable project memory.

## Implementation boundaries

- Only `/` (landing) and `/workspace` (mock workspace) are routes, and neither has a loader or an action.
- Keep the shells empty: do not add database tables, agent state, tools, skill conventions, or domain types until that design is actually decided.
- Never present mock or scripted behaviour as a working assessment.
- `worker-configuration.d.ts` and `.react-router/types/` are generated and ignored; use `pnpm typegen` rather than hand-editing them.
- Generate migrations from `db/schema.ts` with `pnpm db:generate` once tables exist. Review generated SQL and retain applied migrations unchanged.
- Keep runtime database and agent access in `.server.ts` modules or loaders/actions. The SSR build checks the client/server bundle boundary.

## Verification

Use [valueiq-select-checks](.agents/skills/valueiq-select-checks/SKILL.md) before claiming verification or preparing changes for review; it routes each changed area to actual checks.

## Durable memory

- [Decisions](.agents/decisions/README.md) preserve rationale and rejected alternatives.
- [Postmortems](.agents/postmortems/README.md) cover escaped systemic failures and link implemented guardrails.
- [Execution plans](.agents/exec-plans/README.md) exist only while multi-phase work remains unfinished.
