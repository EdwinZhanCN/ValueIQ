# Decision: satisfy the Agents SDK Babel peer separately

Status: implemented.

## Problem

The Agents SDK 0.23 uses the Babel 8 decorators plugin, while React Router 8.3 uses Babel 7 internally. Without a root Babel 8 installation, pnpm resolves the decorators plugin against Babel 7 and reports an incompatible peer. The root `@babel/core` dependency can look unused to someone inspecting application imports.

## Decision

Keep Babel 8 as a development dependency to satisfy the Agents SDK tooling peer. React Router retains its own Babel 7 dependency. The lockfile records both, and `pnpm peers check` verifies the dependency graph. Application code does not invoke Babel directly.

Revisit this dependency when upgrading either SDK; remove it if the peer conflict no longer exists.

## Alternatives considered

**Force Babel 8 throughout the dependency graph** — rejected because React Router explicitly depends on Babel 7.

**Downgrade the Agents SDK or suppress the peer warning** — rejected because separate compatible versions install cleanly without changing the requested architecture or hiding a tooling mismatch.
