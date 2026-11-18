# Decision: Clarify agent, New clients goal and evidence fixes

Status: implemented in part. #159-#166 track the rest. Plan: [`.agents/exec-plans/active/clarify-agent.md`](../exec-plans/active/clarify-agent.md).

## Problem

User testing showed Clarify was slow: the user typed most values and the assistant only asked questions. The test run also found evidence and report problems (F1-F10, B1-B7) and no goal for growth through new customers.

## Decision

- **Two agents, one workspace.** A Clarify agent fills and asks; a Process agent computes. Same Durable Object, same form file. `assistant/tool-access.ts` lists which agent may call each tool, and the dispatcher enforces it with deny-by-default. Prompt wording is never the control.
- **Agent-filled values count at once, labeled by evidence.** `apply_estimate` lets the server, not the model, assign the tier from the basis: a verified file quote gives documented, a labeled default gives benchmark, a figure the user typed gives estimate, and the model's own reasoning gives estimate only at confidence 0.7 or more. Below that nothing is applied and the agent asks. The agent can never set measured and never replaces a value the user entered.
- **Intake asks for a company and a product description**, and Continue starts a prep run with a loading page that falls through to manual Clarify after 90 seconds.
- **Clarify layout:** chat on top, cards below, a list of what the agent filled in.
- **New clients goal.** `gross_annual = min(leads x response x close, capacity cap) x first-year gross profit per customer`, floor 0.85. It values gross profit, not revenue.
- **Result additions:** break-even benefit per year, goal coverage, a tornado from the user's own low/high ranges, a program-cost split, and a utilization cap on recaptured time.
- **F1:** a confirmed passage must contain the figure it backs.

## Alternatives considered

- **Every agent value as "estimate".** Rejected: every driver would fall below the release floor.
- **One agent with both roles.** Rejected: a model that writes inputs and computes can tune inputs toward an answer.
- **Separate inputs tables and agent run tables.** Deferred: the form file holds the new fields, so no migration was needed.
- **Streaming stage names on the loading page.** Deferred: the chat call is not streamed. One honest message is shown.
- **Saving chat between visits.** Deferred: it needs a storage design and testing can proceed with a fresh chat.

## Consequences

- Results now carry more fields; parsers in `shared/output.ts` accept them as optional.
- The tier of agent-filled values is explainable from the stored basis.
- `pnpm arch:check` failures that already exist on `develop` are unchanged.
