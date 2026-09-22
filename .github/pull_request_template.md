## What this changes

<!-- One or two sentences. Link the issue it closes, if there is one. -->

## Why

<!-- The reason, if the diff does not make it obvious. -->

## Boundaries

<!-- Reviewers check these. Tick what applies. -->

- [ ] Arithmetic stays in deterministic, tested TypeScript — no model produces a number
- [ ] No placeholder implies a capability that has not been implemented
- [ ] Server-only code stays in `.server.ts` modules or loaders and actions
- [ ] Generated files (`worker-configuration.d.ts`, `.react-router/types/`) were not hand-edited
- [ ] Applied migrations were not rewritten

## Verified how

<!--
  The checks you actually ran and what you observed. Use the check-selection
  skill (.agents/skills/valueiq-select-checks/SKILL.md) to pick them. Note any
  check you could not run, and why. "Should work" is not verification.
-->

- [ ] `pnpm check`
- [ ] `pnpm test:smoke`
- [ ] Documentation updated where behavior changed
