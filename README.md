# ValueIQ

A technology-stack skeleton for the ValueIQ project value assessment product: React Router v8 on Cloudflare Workers, TypeScript, the Cloudflare Agents SDK, D1 with Drizzle ORM, and a Tailwind CSS v4 interface built from shadcn/ui on Base UI primitives, beUI motion components, Lucide icons, and self-hosted Geist fonts. One Worker serves the interface and hosts a `ValueIQAgent` Durable Object class.

The repository holds two surfaces — the marketing landing page at `/` and the fullscreen workspace at `/workspace` — and nothing else that behaves. Every route is static, the agent is an empty Durable Object, `db/schema.ts` declares no tables, and no data model, agent tool, skill convention, or domain type has been decided yet. Direction lives in [core beliefs](docs/core-beliefs.md) and [user stories](docs/user-stories.md); [architecture](docs/architecture.md) records what is wired and what is deliberately undecided.

## Architecture

```text
/            landing page         site shell: header + footer
/workspace   workspace interface  application shell: full viewport, no site chrome

Wired but empty:  ValueIQAgent (Durable Object) · D1 + Drizzle (no tables yet)
Not decided yet:  data model · agent state and tools · skill conventions · domain types
```

| Directory               | Purpose                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `app/`                  | Two routes — `/` (landing) and `/workspace` (mock workspace) — plus the two surface layouts and UI under `components/` |
| `workers/`              | Worker entry and the empty `ValueIQAgent` export                                                                       |
| `agents/`               | Agent shell: no state shape, no tools, no methods                                                                      |
| `db/`, `drizzle/`       | Drizzle client and schema entry point; no tables and no migrations yet                                                 |
| `.agents/`, `AGENTS.md` | Coding-agent guidance, check selection, and project memory                                                             |
| `docs/`                 | [Architecture](docs/architecture.md), [core beliefs](docs/core-beliefs.md), [user stories](docs/user-stories.md)       |

## Local development

Use Node.js 24 and pnpm 11.7.0 (pinned in `package.json`). If pnpm is missing, install it with `npm install --global pnpm@11.7.0`.

```sh
pnpm install --frozen-lockfile
pnpm typegen
pnpm db:migrate:local
pnpm dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. D1 and agent data persist in `.wrangler/state/`; deleting that directory discards local data. No Cloudflare account or model secret is needed for local development. `.dev.vars.example` documents the currently empty secret requirements.

## Database changes

`db/schema.ts` declares no tables yet, so `pnpm db:generate` reports no schema changes and `pnpm db:migrate:local` has nothing to apply. Once the data model is decided, add tables to `db/schema.ts`, then generate and inspect a migration:

```sh
pnpm db:generate
pnpm db:migrate:local
```

Commit the generated SQL and Drizzle metadata together. Do not edit already-applied migrations. `pnpm db:generate` should report no schema changes when rerun. D1 migration application is handled by Wrangler; Drizzle only generates SQL and executes application queries.

## UI

Tailwind CSS v4 provides the styling layer, and design tokens (cool-neutral surfaces with a single deep teal accent) live in `app/styles.css`. Geist and Geist Mono are self-hosted through Fontsource, and dark mode follows the system preference with a header toggle for an explicit choice.

Components are vendored source rather than packages:

- `app/components/ui/` holds shadcn/ui components generated on Base UI primitives.
- `app/components/motion/` holds beUI animated components used where motion carries meaning.
- `app/components/landing/` holds the landing page sections rendered at `/`.
- `app/components/agents/` holds the workspace interface skeleton rendered at `/workspace`.

Add components with the shadcn CLI. The `@beui` registry namespace is already configured in `components.json`:

```sh
pnpm exec shadcn add card dialog
pnpm exec shadcn add @beui/text-reveal
pnpm format
```

Generated files are Prettier-formatted like the rest of the repository, so run `pnpm format` after adding components. Icons come from `lucide-react`; do not hand-roll SVG icons.

## Verification

```sh
pnpm check
pnpm test:smoke
```

`check` runs generated types, strict TypeScript, ESLint, formatting, the production build, and a deployment dry run. There are no unit tests until the repository holds its first calculation contract. `test:smoke` starts its own server on port 5179 and checks that the landing page and the fullscreen workspace render while `/projects` is not served. Set `VALUEIQ_SMOKE_PORT` to use another port.

`pnpm format` formats authored files. `pnpm preview` serves the latest production build locally. CI runs the same checks; use the [check-selection skill](.agents/skills/valueiq-select-checks/SKILL.md) for narrower checks during development.

## Cloudflare deployment

The repository is configured for local bindings without an account-specific D1 ID. To provision a remote database and deploy:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create valueiq
```

Add the returned `database_id` to the existing `d1_databases` entry in `wrangler.jsonc`, preserving `binding: "DB"`, `database_name: "valueiq"`, and `migrations_dir: "drizzle"`. This ID is configuration, not a secret. Adding it may select a fresh local D1 database; reapply local migrations if needed.

```sh
pnpm typegen
pnpm build
pnpm deploy:check
pnpm db:migrate:remote
pnpm deploy
```

Building before the remote migration refreshes Vite's generated Wrangler config with the new binding ID. The SQLite Durable Object migration registers `ValueIQAgent` on deployment; `pnpm db:migrate:remote` has nothing to apply until the first table is designed. Later model-provider secrets belong in ignored `.dev.vars` locally and `wrangler secret put` remotely.

This scaffold has no authentication: a deployed instance is a shared prototype. Remote provisioning, migration, and deployment are not performed by initialization.

Framework setup follows the [Cloudflare React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/) with the [React Router v8 context API](https://reactrouter.com/api/other-api/adapter).
