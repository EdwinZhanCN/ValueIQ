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

CI runs these checks and packages both Cloudflare environments without credentials. Configure branch protection to require the `verify` check before merging. `pnpm format` fixes style.

## Deploy

Merge feature PRs into `develop` to deploy the shared development environment. Merge a tested release PR into `main` to deploy production. Both run on the maintainer’s Cloudflare account with separate Workers, D1 databases, and Durable Object namespaces.

See [deployment setup and recovery](docs/deployment.md) for one-time Cloudflare provisioning, GitHub environment secrets, branch protection, and release behavior.

## License

[MIT](LICENSE) © 2026 ValueIQ Team
