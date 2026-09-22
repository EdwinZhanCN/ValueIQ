# Decision Records

Decision records preserve project-coupled rationale that future work would otherwise re-litigate. They explain why a durable choice stands, not the implementation history of a change.

## When to write one

Write a decision when later work depends on the rationale behind a behavior, architecture boundary, wire or storage format, dependency policy, or rejected direction. Do not write one merely because a change is large.

## File and format

Use `YYYY-MM-DD-topic.md` in this directory:

```markdown
# Decision: <title>

Status: implemented | rejected - <short clarification if useful>

## Problem

## Decision

## Alternatives considered
```

State shipped reality in the present tense. `Alternatives considered` is required and explains why each serious alternative lost.

## Lifecycle

Never rewrite a record into a different decision. When a decision changes, add a new record and cross-link both. Keep current implementation detail in `docs/architecture.md`; link it instead of copying it here.
