# Postmortems

Postmortems explain systemic failures that escaped to a user, a protected branch, production, or a release. The important question is why every existing safety net missed the failure.

## When to write one

Write a postmortem when the escape reveals a missing test, hidden default, ambiguous ownership boundary, unsafe operational assumption, or absent recovery path. Ordinary bugs that were caught within the expected development loop do not need one.

## File and format

Use sequential names such as `0001-short-title.md`:

```markdown
# Postmortem NNNN: <title>

## Executive summary

## What broke

## Why every net missed it

## Guardrails added
```

## Completion rule

A postmortem is not complete with planned guardrails. `Guardrails added` must link regression tests, CI gates, monitoring, recovery checks, or standing rules that actually exist. If the fix supersedes a former guardrail, update the record so its links remain truthful.
