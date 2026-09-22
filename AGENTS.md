# ValueIQ agent guide

Human setup and deployment commands live in [README.md](README.md).

## Start here

- Read [architecture](docs/architecture.md) before changing UI/server, agent, or storage boundaries.
- Read [core beliefs](docs/core-beliefs.md) when changing assessment behavior or product scope.

## Repository map

- `app/`: React Router routes, the two surface layouts, and the UI under `components/`.
- `workers/app.ts`: Worker entry and the `ValueIQAgent` Durable Object export.
- `agents/valueiq-agent.ts`: the `ValueIQAgent` Durable Object that owns a project conversation.
- `db/`, `drizzle/`: Drizzle schema and client, plus the migrations generated from the schema.
- `docs/`: [architecture](docs/architecture.md) and [core beliefs](docs/core-beliefs.md).
- `.agents/skills/`: coding-agent procedures.

## Implementation boundaries

- Only `/` (landing) and `/workspace` (assessment workspace) are routes.
- Arithmetic belongs in deterministic, tested TypeScript. A model chooses questions and tools; it never produces a number.
- A missing fact becomes a follow-up question, never an invented value. An estimated capacity gain is never presented as cash saved.
- `worker-configuration.d.ts` and `.react-router/types/` are generated and ignored; use `pnpm typegen` rather than hand-editing them.
- Generate migrations from `db/schema.ts` with `pnpm db:generate`. Review generated SQL and retain applied migrations unchanged.
- Keep runtime database and agent access in `.server.ts` modules or loaders/actions. The SSR build checks the client/server bundle boundary.

## Verification

Use [valueiq-select-checks](.agents/skills/valueiq-select-checks/SKILL.md) before claiming verification or preparing changes for review; it routes each changed area to actual checks.
