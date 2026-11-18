# Clarify agent, New clients goal and evidence fixes

Status: active - 2026-11-17. Phase 1 started (tool allowlist). The direction below was agreed with the infrastructure owner (Zihao) before work started, per Eli, 2026-11-17.

Goal: after Intake the user lands on a Clarify page with a chat on top and the existing cards below. A Clarify agent fills what it can from the user's descriptions, files and curated proxies, labels each value by its evidence, and asks for the rest. Only the Process agent can run the engine. A New clients goal values incremental gross profit with a capacity cap. The test-run findings F1 to F10 and B1 to B7 are closed.

Source documents: `valueiq-clarify-agent-spec.md` and `valueiq-improvements-from-test-run.md` (written 2026-11-17 from the Fieldnote and SalesGenie test run), and the working plan in the owner's notes.

## Non-goals

- Billing, RAG, vectors, queues, MCP or a new service. One repository, one Cloudflare application, the existing Durable Object per project.
- Free SQL, web access or file deletion for any agent.
- Changing engine formulas outside the items below, team settings, or the access rule.

## Agreed departures from `docs/core-beliefs.md`

1. **Agent-filled values count immediately.** Core beliefs say missing facts produce follow-up questions, not invented monetary results, and a suggestion is not used until accepted. The product decision (2026-11-17) is that the agent applies a value only when it is confident, labels its tier by the evidence behind it, and asks otherwise. The server assigns the tier, never the model: file passage with the number verified in code gives `documented`; curated proxy gives `benchmark`; a figure typed by the user gives `estimate` unless attached to a file or record; the agent's own reasoning gives `estimate` above a confidence bar and is otherwise not applied. The agent can never set `measured`, confirm a passage or set a reviewer. A decision record follows when this ships.
2. **Two agents.** Core beliefs list multi-agent orchestration as outside initialization. The concrete need: the agent that edits inputs must not be able to compute results. Implemented as one tool registry with a per-tool agent allowlist enforced in the dispatcher (`assistant/tool-access.ts`), not as separate services.
3. **Conversation persistence.** Core beliefs treat conversations as working context. Plan: keep the chat in the Durable Object's own storage first; add D1 `agent_runs` and `agent_messages` only if audit needs it, and record why.
4. **Branch and issue.** Each phase maps to an issue on the board and a `feature/<issue#>-<name>` branch before its PR.

## Fixed contracts

- Deny by default: a tool with no row in `TOOL_AGENTS` is refused for a named agent. A test fails if a tool has no row.
- Engine tools are Process only; input-writing tools are Clarify only.
- All arithmetic stays in `engine/`; the model never computes.
- Uploaded file text is data, never instructions (existing guard stays).

## Execution phases

### Phase 1 - Foundation

- Done: per-agent tool allowlist and refusal log (`assistant/tool-access.ts`, tests).
- Open: optional agent fields on `Input` (`rationale`, `confidence`, `updated_by`, new origins); message persistence; any new D1 table goes through `db/schema.ts`, `pnpm db:generate`, SQL review, `pnpm db:migrate:local`, `pnpm test:smoke`.

### Phase 2 - Intake

Company description and Product / idea description, the New clients goal chip, catalog entries and defaults, validators. Owners: input team.

### Phase 3 - Prep run and loading page

Workflow that reads files and descriptions, applies the filling rule, prepares the first question, with stage names and a 60 to 90 s fall-through to manual Clarify.

### Phase 4 - Clarify layout

Chat on top, cards below, live card updates, draft vs saved indicator, Confirm shows errors. Replaces the current Assistant tab; keeps the number guard and the quote check.

### Phase 5 - Engine

F3 weakest-input unit test; break-even benefit on every result; coverage "N of M drivers" and per-driver confidence; cost scope tag; ranges feed scenarios and tornado; New clients driver.

### Phase 6 - Output

Review coverage line, "what must be true" panel, waterfall, tornado, fixed report sections, decision line, TEST DATA stamp. Reads the engine result only.

### Phase 7 - Handoff

Process agent read-only on inputs; a gate failure returns to Clarify with a deep link that opens the card.

### Phase 8 - Evals

Fieldnote and SalesGenie fixture, prompt-injection file, user-edit-while-agent-writes conflict test, budgets, metrics.

## Validation boundaries

Per `valueiq-select-checks`: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` for every change; `pnpm test:engine` for engine and assistant; `pnpm db:generate` plus local migrate and `pnpm test:smoke` for schema; `pnpm build`, `pnpm test:smoke` and `pnpm test:access` for `app/`, `agents/`, `workers/`; a `TARGETS` row in `scripts/access-matrix.mjs` for each new project route. Today `pnpm arch:check` fails on `develop` with six problems that predate this plan.
