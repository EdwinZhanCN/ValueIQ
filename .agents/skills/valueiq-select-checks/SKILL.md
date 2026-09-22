---
name: valueiq-select-checks
description: Use before claiming verification or preparing ValueIQ changes for review when a diff touches routes, Agent/D1 boundaries, calculations, generated migrations, or Worker configuration; select checks for the changed behavior.
---

# Select checks

1. Inspect `git status --short` and the outgoing diff against the intended base. Include untracked files during initialization.
2. Classify changed paths using the rows below. Read the current ownership contract in `docs/architecture.md` when changes cross boundaries.
3. Run every relevant row. Generated SQL must agree with the schema, and a successful TypeScript check alone does not prove that Worker bindings run.

| Changed area                                        | Required evidence                                                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript or dependency changes                    | `pnpm typecheck` and `pnpm lint`                                                                                                                            |
| `db/schema.ts`                                      | `pnpm db:generate`; review SQL, then `pnpm db:migrate:local` and `pnpm test:smoke`                                                                          |
| `drizzle/`                                          | Apply to local D1 with `pnpm db:migrate:local`; run `pnpm test:smoke`; for upgrades also apply to a copy of the previous schema with representative records |
| `app/`, `agents/`, `workers/`                       | `pnpm build` and `pnpm test:smoke`; inspect changed pages in a browser if visible behavior changes                                                          |
| `wrangler.jsonc`, Vite config, runtime dependencies | `pnpm typecheck`, `pnpm build`, `pnpm deploy:check`, and `pnpm test:smoke`                                                                                  |
| `pnpm-lock.yaml` or package manifest                | `pnpm install --frozen-lockfile` and `pnpm peers check`, followed by relevant runtime checks                                                                |
| Any authored files                                  | `pnpm format:check`                                                                                                                                         |
| Documentation or harness                            | Verify linked paths exist and named scripts match `package.json`; distinguish application `skills/` from coding-agent `.agents/skills/`                     |

The repository currently holds no calculation contracts, so `pnpm check` has no unit-test step; add tests back with the first contract.

`pnpm test:smoke` starts and stops its own local development server and checks that both surfaces render. It never accesses remote D1. Its default port is 5179; set `VALUEIQ_SMOKE_PORT` if needed. Do not run two smoke tests concurrently.

For a schema change, run `pnpm db:generate` again after generation; it should report no changes. Never rewrite already-applied SQL just to pass a check. Worker and route types are generated and ignored; regenerate them using `pnpm typegen`.

`pnpm check` runs the static/unit/build/dry-run bundle used in CI. Smoke testing is a separate CI step because it starts a runtime and tests persistence. Remote migrations and deployments are operational changes, not local verification.

Report only commands actually run, observed results, and relevant checks that could not run. Explain any remaining manual or prose-only boundary.
