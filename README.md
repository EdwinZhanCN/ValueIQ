# ValueIQ

[![Check](https://github.com/EdwinZhanCN/ValueIQ/actions/workflows/check.yml/badge.svg)](https://github.com/EdwinZhanCN/ValueIQ/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A technology-stack skeleton for a project value assessment product: React Router v8 on Cloudflare Workers, TypeScript, the Cloudflare Agents SDK, D1 with Drizzle ORM, and a Tailwind CSS v4 interface. One Worker serves the interface and hosts a `ValueIQAgent` Durable Object.

**The stack is wired end to end; the application design is not decided.** There are no database tables, no agent state, no tools, and no domain types. Two surfaces exist and nothing else behaves — the landing page at `/` and the mock workspace at `/workspace`. [Architecture](docs/architecture.md) records what is wired and what is deliberately undecided; [core beliefs](docs/core-beliefs.md) holds the claims the product is allowed to make.

## Run it

Node.js 24 and pnpm 11.7.0, both pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm typegen
pnpm dev
```

Open the URL Vite prints, normally <http://localhost:5173>. No Cloudflare account, database, or secret is needed: local D1 and Durable Object state persist in ignored `.wrangler/state/`.

## Verify

```sh
pnpm check        # generated types, strict TypeScript, ESLint, Prettier, build, deploy dry run
pnpm test:smoke   # starts a real local Worker and asserts both surfaces render
```

These are what CI runs, and neither needs credentials. `pnpm format` fixes style.

## Contributing

ValueIQ is a team project. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks to run, the pull request flow, how to author components or database changes, and the boundaries reviewers enforce. `main` requires the `verify` check to pass.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md), and report vulnerabilities through [SECURITY.md](SECURITY.md) rather than a public issue.

## Deployment

Deployment is a team decision that has not been made. No Cloudflare account, D1 database, or release process exists yet, and `wrangler.jsonc` carries no account-specific D1 ID, so every contributor can work without one. Do not deploy from a personal account or commit account identifiers. [CONTRIBUTING.md](CONTRIBUTING.md#deployment) holds the provisioning steps for when the team decides.

## License

[MIT](LICENSE) © 2026 ValueIQ Team
