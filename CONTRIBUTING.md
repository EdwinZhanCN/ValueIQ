# Contributing to ValueIQ

ValueIQ is a team project. This guide is written for anyone joining the repository — you should be able to clone it, run every check, and open a reviewed pull request without a Cloudflare account, a paid plan, or anyone's personal credentials.

## Read these first

Read in this order before changing behaviour:

1. [Core beliefs](docs/core-beliefs.md) — the claims the product is allowed to make.
2. [Architecture](docs/architecture.md) — how the product is put together.
3. [AGENTS.md](AGENTS.md) — repository boundaries and how verification is routed.

## What ValueIQ is

A project value assessment product. `/` is the landing page and `/workspace` is the assessment workspace.

Two rules shape every change. Arithmetic belongs in deterministic, tested TypeScript — a model may choose questions and tools, but it never produces a number. And a missing fact becomes a follow-up question rather than an invented value, because an unsupported figure is worse than an acknowledged gap.

## Set up

You need Node.js 24 and pnpm 11.7.0. The exact versions are pinned in `.nvmrc`, `package.json` (`engines`, `packageManager`), and the CI workflow; match them to avoid a lockfile diff.

```sh
git clone https://github.com/EdwinZhanCN/ValueIQ.git
cd ValueIQ
pnpm install --frozen-lockfile
pnpm typegen
pnpm dev
```

If pnpm is missing, install the pinned version with `npm install --global pnpm@11.7.0`.

`pnpm install --frozen-lockfile` is deliberate: it fails instead of silently rewriting `pnpm-lock.yaml`, so a lockfile change is always a visible, reviewable commit.

**No account or secret is required.** Local development runs against local D1 and Durable Object state under `.wrangler/state/`. Every check in this repository, including the deployment dry run, works without Cloudflare credentials.

## Run checks

```sh
pnpm check        # typegen, strict tsc, ESLint, Prettier, production build, deploy dry run
pnpm test:smoke   # starts a real local Worker and asserts both surfaces render
```

`pnpm check` and `pnpm test:smoke` are what CI runs. Before you claim a change is verified, use the [check-selection skill](.agents/skills/valueiq-select-checks/SKILL.md) — it routes each changed area to the checks that actually prove it, so you can run a narrower set while iterating and the full set before review.

Formatting is automated. Run `pnpm format` rather than hand-fixing style; `pnpm format:check` fails CI on drift.

## Open a pull request

1. Branch from `main`.
2. Make the change, including documentation where behavior changes.
3. Run `pnpm check` and `pnpm test:smoke`.
4. Open a pull request and fill in the template.
5. CI must pass. `main` requires the `verify` check to be green before merge.

Keep pull requests focused. A change that mixes a behavioural change with unrelated formatting or dependency churn is harder to review and harder to revert.

Write commit subjects in the imperative mood and explain _why_ in the body when the reason is not obvious from the diff.

## Boundaries reviewers enforce

- The interface stays separate from anything backend-shaped. Server-only code lives in `.server.ts` modules or in loaders and actions; the SSR build checks the client/server bundle boundary and will fail if you cross it.
- Arithmetic stays in deterministic, tested TypeScript. A model may choose questions and tools; it never produces a number.
- No placeholder may imply a capability that has not been implemented.
- Generated files are not hand-edited. `worker-configuration.d.ts` and `.react-router/types/` come from `pnpm typegen`.
- Applied migrations are never rewritten. Generate SQL from `db/schema.ts` with `pnpm db:generate`, review it, and commit it with its metadata.

## Deployment

Merging to `main` deploys to Cloudflare through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it applies D1 migrations, then builds and deploys the Worker. The workflow reads two repository secrets, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and skips with a notice when they are absent, so a contributor without Cloudflare access gets a green run instead of a failure.

Two rules keep that workable for everyone:

- Never commit account IDs, database IDs, or API tokens.
- Keep `pnpm deploy:check` credential-free, so CI keeps covering the packaging path.

`wrangler.jsonc` holds the Worker name, its bindings, and the D1 database. Changing a binding affects deployment; call it out in the pull request.

To deploy by hand, `pnpm deploy` builds and publishes using whatever credentials Wrangler already has.
