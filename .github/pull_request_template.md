## What this changes

<!-- One or two sentences. Link the issue it closes, if there is one. -->

## Why

<!-- The reason, if the diff does not make it obvious. -->

## Boundaries

<!-- Reviewers check these. Tick what applies. -->

- [ ] No mock, scripted, or placeholder behaviour is presented as a working assessment
- [ ] Empty shells (`agents/valueiq-agent.ts`, `db/schema.ts`, `app/context.server.ts`) are still empty
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
- [ ] Documentation and decision records updated where the change warrants it
