# Contributing to ValueIQ

ValueIQ is a team project. This guide is written for anyone joining the repository — you should be able to clone it, run every check, and open a reviewed pull request without a Cloudflare account, a paid plan, or anyone's personal credentials.

## Read these first

Read in this order before changing behaviour:

1. [Core beliefs](docs/core-beliefs.md) — the claims the product is allowed to make.
2. [Architecture](docs/architecture.md) — what is wired, and what is deliberately undecided.
3. [AGENTS.md](AGENTS.md) — repository boundaries and how verification is routed.

## What this repository currently is

A tech-stack shell with two static surfaces: the landing page at `/` and the mock workspace at `/workspace`. The stack is wired end to end; the application design is not decided.

Do not add database tables, agent state, agent tools, skill conventions, or shared domain types. Do not wire a surface to invented behaviour, and never present scripted or mock output as a working assessment. If you believe a design decision is ready to make, open an issue or a decision record first — see [Decision records](#decision-records).

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
2. Make the change, including documentation and a decision record when the change warrants one.
3. Run `pnpm check` and `pnpm test:smoke`.
4. Open a pull request and fill in the template.
5. CI must pass. `main` requires the `verify` check to be green before merge.

Keep pull requests focused. A change that mixes a behavioural change with unrelated formatting or dependency churn is harder to review and harder to revert.

Write commit subjects in the imperative mood and explain _why_ in the body when the reason is not obvious from the diff.

## Boundaries reviewers enforce

- The interface stays separate from anything backend-shaped. Server-only code lives in `.server.ts` modules or in loaders and actions; the SSR build checks the client/server bundle boundary and will fail if you cross it.
- An empty shell stays empty. `agents/valueiq-agent.ts`, `db/schema.ts`, and `app/context.server.ts` are structure without behaviour on purpose.
- Scripted behaviour is never presented as a working assessment.
- Generated files are not hand-edited. `worker-configuration.d.ts` and `.react-router/types/` come from `pnpm typegen`.
- Applied migrations are never rewritten. Generate SQL from `db/schema.ts` with `pnpm db:generate`, review it, and commit it with its metadata.

## Decision records

[`.agents/decisions/`](.agents/decisions/README.md) preserves rationale that later work would otherwise re-litigate — architecture boundaries, dependency policy, storage formats, rejected directions. Write one when a later contributor would otherwise have to guess why, and include the alternatives you rejected and why they lost.

Current implementation detail belongs in `docs/architecture.md`; the decision record explains the reasoning.

## Deployment

Deployment is a team decision, and the team has not chosen a Cloudflare account or a release process yet. Until it does:

- Do not deploy from a personal Cloudflare account.
- Do not commit account IDs, database IDs, or API tokens.
- Keep `pnpm deploy:check` credential-free so CI keeps covering the packaging path.

When the team settles the release process, record the account ownership and the deploy path in a decision record, and prefer a team-owned automation identity over any individual's credentials. See [README.md](README.md#cloudflare-deployment) for the commands the process will build on.
