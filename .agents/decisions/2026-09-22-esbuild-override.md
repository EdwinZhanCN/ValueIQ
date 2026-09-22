# Decision: Override esbuild inside the deprecated drizzle-kit loader

Status: implemented

## Problem

Publishing the repository enabled Dependabot, which immediately reported GHSA-67mh-4wv8-2f99 against `esbuild@0.18.20`. That copy arrives only through `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils@3.3.2`, which pins `esbuild: ~0.18.20`. `drizzle-kit` 0.31.11, the current release, still depends on that loader, so upgrading the direct dependency does not remove the vulnerable copy.

esbuild is already present at 0.25.12 and 0.28.x for Vite, Wrangler, and drizzle-kit's own direct dependency. The 0.18.20 copy existed only for the legacy loader, and the advisory covers esbuild's development server, which drizzle-kit never starts.

## Decision

Scope an override to the one package that requests the vulnerable range, in `pnpm-workspace.yaml`:

```yaml
overrides:
  "@esbuild-kit/core-utils>esbuild": "^0.25.0"
```

The override resolves to the 0.25.12 copy the lockfile already holds. `pnpm why esbuild` then reports 0.25.12, 0.28.1, and 0.28.2, with no 0.18.x.

Verified against the patched loader: `@esbuild-kit/core-utils` resolves esbuild 0.25.12, both `transformSync` and `transform` return transpiled TypeScript, `pnpm db:generate` still reads `drizzle.config.ts` and reports no schema changes, and `pnpm check` passes.

Revisit when `drizzle-kit` drops `@esbuild-kit/esm-loader`; remove the override then.

## Alternatives considered

**Upgrade `drizzle-kit`** — rejected because 0.31.11 still depends on `@esbuild-kit/esm-loader`, so the vulnerable range survives the upgrade.

**Dismiss the alert as not exploitable** — rejected because a dismissed alert on a public repository is invisible to the next reader, while a scoped override carries a check that proves the tool still works.

**Override `esbuild` globally** — rejected because it would drag Wrangler's and Vite's 0.28.x copies down to 0.25, breaking working tooling to fix one legacy loader.
