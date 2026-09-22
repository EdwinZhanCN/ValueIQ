# Decision: A tech-stack shell, not an application design

Status: implemented

## Problem

The repository had accumulated implementations of designs nobody had agreed on: a four-table D1 schema with a generated migration, calculation tools for capacity, productivity, risk, and data quality with their unit tests, five application skill conventions, an agent that owned an `AssessmentState` and answered with two scripted replies, and a server helper that joined assessments to projects. Read quickly, the repository claimed those decisions were already made. Read carefully, they were guesses — and the scripted agent presented a guess as behaviour.

## Decision

Keep the chosen stack wired end to end and empty out the application design:

- The stack stays wired: React Router v8 in framework mode on Cloudflare Workers, the `DB` D1 binding with the Drizzle client, the `ValueIQAgent` Durable Object binding and class, Tailwind v4 with the vendored shadcn/Base UI and beUI components, and the full check chain.
- The application design is emptied: `agents/valueiq-agent.ts` is an empty `ValueIQAgent` class with no state shape, tools, or methods; `db/schema.ts` declares no tables and `drizzle/` holds no migrations; the calculation tools, application skill conventions, and assessment server helper are gone.
- The interface keeps exactly two surfaces: the landing page at `/` and the mock workspace at `/workspace`, neither of them with a loader or an action.
- Direction stays in prose: core beliefs, user stories, the architecture document, and this directory. Nothing in the code implies a design that has not been made.

## Alternatives considered

**Keeping the implemented pieces as "unused but correct"** — rejected: unused code that encodes unmade decisions reads as settled design and quietly becomes the answer by default.

**Keeping the scripted agent but labelling it a stub** — rejected: a stub that still answers with canned text is exactly what the core beliefs forbid, and it hides the shape that is actually empty.

**Deleting the bindings and runtime dependencies as well, leaving only the UI** — rejected: the stack would then be a claim in a document instead of something `pnpm check` and `pnpm deploy:check` actually exercise.
