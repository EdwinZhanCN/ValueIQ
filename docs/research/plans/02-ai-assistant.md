# Plan 02: AI assistant, calculation agent, loading page (Eli)

Read `README.md` first. Issues: #72 A1, #73 A2, #74 A3, #75 A4, #76 A5, #77 A6, #78 L1, #79 L2, #80 L3, #81 L4, #92 Q6, #93 Q7, #94 Q8. Integration: PR #109.

## Goal

An assistant that checks the form for gaps, captures backing evidence, and asks only what it needs, plus a calculation agent that runs the engine tools, shows progress on the loading page, and can stop to ask at most 3 blocker questions. It is a **pipeline**: it routes data to tools and explains tool output. It never calculates.

## Pieces

| Piece                                  | Behavior                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Intake assistant (page after the form) | default check, missing check, question cards, "anything else?", measurement plan, **pre-flight gate** |
| Calculation agent (loading page)       | runs engine tools, live updates, `ask_user`, gate, narrative                                          |
| Loading page                           | progress checklist, mid-run question card, error and retry states, forced-failure demo                |

## Intake assistant prompt (draft, summarized)

Step 1 default check: call `get_defaults`; ask once "use industry defaults for the rest?" showing source and tier of each; write accepted ones tagged. Step 2 missing check: `validate_inputs`; use file descriptions first; **pre-fill values from files with the quoted passage** (one tap to confirm); rank gaps by effect on the result (essential costs first). Step 3 question cards: one card per gap, max 4 fields, options Confirm / Not sure / Use labeled proxy / Exclude; capture **backing in the same card** (source file, period and sample, low and high, second source, verified by) as optional chips with inferred defaults; flag double counting and out-of-range values now. Step 4: "Anything relevant we did not ask?" into `other_notes`; propose caveats via `propose_adjustment` (shown as proposals); propose each driver's measurement plan. Step 5 pre-flight: `preflight_gate` dry-runs validation and the confidence gate without computing; if a driver is below its floor tell the user now with the cheapest fix ("attach the incident log to raise confidence from 0.72 to 0.90") or offer to drop it to unquantified.
Effort rules: batch related fields, keep an `asked[]` log, never ask what a file or default answers unless the effect is large, stop when pre-flight passes, stuck 3 times means offer proxy or exclude, target 95% required-field coverage.
Hard rules: no arithmetic, no invented numbers, a suggestion is not used until the user accepts it (spec F-15), AI confidence never lowers a haircut.

## Calculation agent prompt (draft, summarized)

Loop: `validate_inputs`, then per driver `compute_haircut` per effect input and `compute_driver`, then `compute_project`, `sensitivity`, `get_confidence`, `release_gate`, then summary and measurement plan written **only from tool output with step refs**. Blockers: `ask_user` only if the value is not in the form, descriptions, files or defaults, **and** a proxy would change a headline number by more than 5% or push a driver below its floor, **and** it was not already asked; max 3 per run, batched; unanswered becomes Exclude. Confidence: call `get_confidence` after every tool call; publish only if `release_gate` passes; otherwise return the gap list. Never raise confidence by wording; only new evidence changes it. An integrity scan rejects any number in the narrative that is not in tool output or lacks a step ref.

## Alignment with the parallel input build (read with `01a-input-structure.md`)

The input team builds the form and the card UI while the assistant and engine are built here. These rules keep them compatible:

- **One id list.** The assistant reads and writes only the ids in `ROI.md` section 3 (copied in `01a`). It never invents an id; an unknown id is a validation error.
- **Roles decide what it asks.** Ask backing only for `effect` inputs (and `basis` for cost lines). `known` inputs need a value only. Never ask backing for adoption, staff, weeks or hourly cost.
- **Write structured backing, not text.** `source_file_id`, `quote` + `quote_confirmed`, `second_source_value`, `observations` or `period_months`, `source_date`, `verified`, and `low`/`high`. These are what the engine's six checks read.
- **Tier from the user's plain answer** (table in `01a` section 2). `measured` needs a file and a confirmed quote, and never applies to a typed time saving. A default keeps its own tier and `origin: default`; assistant suggestions get `origin: assistant_accepted` only after the user taps accept.
- **Unknown is `value: null`**, never 0. "Not sure" leads to the labeled default or exclusion.
- **Same card contract.** One card per gap, max 4 fields, options Confirm / Not sure / Use labeled default / Exclude, backing chips pre-filled from file passages. The form file shape and the `asked[]` log are the ones in `01a` section 8.
- **Decided by Eli (Nov 5):** `cost_per_error`, `cost_of_delay_per_day`, `loss_per_event` are effect inputs; per-line cost `basis`; measurement plan ids (`ROI.md` 3.8). The assistant asks backing for the three value-per-unit inputs and the engine treats them as effect inputs.

## Confidence (why this is deterministic)

Integrity checks must all pass (bounds, reconciliation, traceability, no unresolved double count, no missing essential cost). Evidence confidence: input = 1 minus haircut; driver = min over its effect inputs; project = benefit-weighted mean of included drivers, capped by the weakest driver that is over 30% of benefit. Floors: drivers 0.80 / 0.80 / 0.85 / 0.85 (time, data quality, decision speed, risk); project 0.85. All thresholds are config values.

## Tools (names; details in `ROI.md` sections 5 and 11)

`validate_inputs, get_defaults, preflight_gate, compute_haircut, propose_backing, propose_adjustment, compute_driver, compute_project, sensitivity, explain_step, get_confidence, release_gate, ask_user, apply_override`. JSON in, JSON out, schema validated; `propose_*` write nothing until the user accepts.

## Anti-gaming rule

A tier upgrade to `measured` needs an attached file in the same project **and** a user-confirmed quoted passage. The engine records both.

## Loading page (L1-L3)

Checklist (files read, haircuts, drivers, project, scenarios, confidence, gate, narrative), progress saved, retry or manual entry on model failure, mid-run question card with value / use proxy / exclude, forced failure state for the demo. Gap-list outcome is not an error; route the user back to intake with answers preserved (Ryan owns that screen with the back and progress behavior).

## Build order

Stub run first (labeled STUB, by Sat Nov 7), then real engine for time savings, then Gemini assistant, then confidence gate and gap list, then files as backing. Model choice (Q8): cheap Gemini for the assistant, stronger for narrative; file limits (Q7).

## Evidence behind the design

Self-reported time savings are unreliable (METR RCT: predicted 24% faster, measured 19% slower; Danish study: 2.8% of hours vs 15%+ in trials) so typed savings are never `measured`. Experts are overconfident (Hubbard, secondary source) so confidence comes from checkable backing. Forrester TEI and Vermont's IT business case form both separate real cash from freed time and require "how measured" per benefit.

## Collaboration

- Input team: form file format and card contract; backing fields on every card.
- Ryan: reads the result and gap-list shapes (`04-output.md`); Eli owns tool contracts and thresholds.
- Zihao: agent routing and access, pause/resume for `ask_user`, file read for Gemini, secrets.

## Open questions

Q6 (screen scope), Q7 (file limits), Q8 (models), thresholds (test on real cases). The pause API is settled: `step.waitForEvent` (contract).
