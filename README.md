# ValueIQ

[![Check](https://github.com/EdwinZhanCN/ValueIQ/actions/workflows/check.yml/badge.svg)](https://github.com/EdwinZhanCN/ValueIQ/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ValueIQ tells you what a project is worth before you fund it. You describe the change you are considering; ValueIQ asks for the facts an estimate actually needs, then values the outcome with math you can audit.

Arithmetic is owned by deterministic, tested TypeScript — never by a language model. A missing fact becomes a follow-up question rather than an invented number, and every figure keeps its formula, its inputs, and the evidence behind each assumption. Capacity, data quality, and risk reduction are each reported for what they are, so an estimated capacity gain is never quietly presented as cash saved.

Projects, inputs, and results are stored in your own Cloudflare database instead of being trapped in a chat log.

## Run it

Node.js 24 and pnpm 11.7.0, both pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm typegen
pnpm dev
```

Open the URL Vite prints, normally <http://localhost:5173>. Local D1 and Durable Object state persist in `.wrangler/state/`.

## Verify

```sh
pnpm check        # generated types, strict TypeScript, ESLint, Prettier, build, deploy dry run
pnpm test:smoke   # starts a real local Worker and asserts both surfaces render
```

These are exactly what CI runs, neither needs credentials, and `main` requires the `verify` check to pass before a merge. `pnpm format` fixes style.

## Deployment

Every push to `main` deploys to Cloudflare through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which applies D1 migrations and then the Worker. It needs two repository secrets:

| Secret                  | Value                                               |
| ----------------------- | --------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with `Workers Scripts:Edit` and `D1:Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID                           |

Until both exist the workflow skips with a notice instead of failing.

Before the first deploy, create the D1 database and put its `database_id` into the `d1_databases` entry in `wrangler.jsonc`, keeping `binding: "DB"`, `database_name: "valueiq"`, and `migrations_dir: "drizzle"`:

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create valueiq
```

The database ID is configuration, not a secret. To roll out by hand, `pnpm deploy` builds and publishes with whatever credentials Wrangler already has.

## License

[MIT](LICENSE) © 2026 ValueIQ Team
