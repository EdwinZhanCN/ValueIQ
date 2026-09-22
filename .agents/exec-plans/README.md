# Execution Plans

Execution plans are resumable working documents for unfinished, multi-phase engineering work. They coordinate implementation; they are not a permanent decision archive.

## When work earns a plan

Create a plan when work spans multiple pull requests or modules, must freeze contracts before implementation, coordinates a migration or recovery, or must survive handoff between agent sessions. A focused single-change task does not need one.

## Location and shape

Active plans live in `active/<topic>.md` and use this minimum shape:

```markdown
# <Title>

Status: active - <current reality and date of frozen contracts>.

Goal: <observable end state>.

## Non-goals

## Fixed contracts

## Execution phases

### Phase 0 - Lock current failures

### Phase 1 - <implementation slice>

## Validation boundaries
```

The status and phase list must change in the same work that changes reality. Validation boundaries describe observable completion evidence, not merely a list of test files.

## Completion and abandonment

Before completion, verify the validation boundaries, extract durable rationale into `.agents/decisions/`, move surviving debt to its owning tracker, and update `docs/architecture.md`. Then delete the active plan; version control retains its history. If a rejected direction remains tempting, record the rejection as a decision before deleting the plan.
