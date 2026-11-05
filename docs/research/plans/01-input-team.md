# Plan 01: Input team (Jonathan, Jeremiah)

I2/I3 follow-up (Nov 5): [input handoff v1](input-contract-v1.md) proposes the complete envelope, question/default catalog, conditional paths and a synthetic example. It reconciles the later `team_settings` decision with the original hardcoded-default wording. This is a review proposal, not an owner-approved runtime contract; I6 serialization and real save/upload integration remain pending.

Read `README.md` first, then **`01a-input-structure.md`: the field-by-field spec you build from** (ids, roles, bounds, defaults, backing fields). It is aligned with the engine and the assistant, which are built in parallel from the same ids (`ROI.md` section 3). Do not rename an id or change a unit without telling Eli (sole owner of the engine and assistant). Issues: #51 I1, #52 I2, #53 I3 (Ag1), #54 I4, #55 I5, #56 I6, #91 Q5, #93 Q7, #77 A6.

## Your goal

Define every question and every data and cost input per goal, build the intake form and upload, and hand the assistant and engine one **form file**. You decide what is asked; the AI only fills gaps.

## What changed since the Interim plan (read this)

The ROI research changed what a good input is. Each input needs more than a value:

| Per input field                                                                                                                                                                                    | Why                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`, `unit`, `period`                                                                                                                                                                          | basic                                                                                                                                                             |
| `tier` (measured / documented / benchmark / estimate / assumption)                                                                                                                                 | sets the haircut band                                                                                                                                             |
| `backing` (effect inputs only): `source_file_id`, `quote` + `quote_confirmed`, `second_source_value`, `observations` or `period_months`, `source_date`, `verified`; plus `low`/`high` on the input | the engine scores six yes/no checks from these exact fields and slides the haircut; free text cannot be scored. Full record in `01a-input-structure.md` section 2 |
| `origin` (user, file, default, proxy accepted)                                                                                                                                                     | audit trail                                                                                                                                                       |
| `low`, `high`                                                                                                                                                                                      | a range, not just a point                                                                                                                                         |

So the answer to **Q5 is yes**: every input carries unit, source, period, and tier. Capture backing **in the same card** as the value (optional chips with defaults, so a user with nothing to add taps Confirm).

## Inputs to collect (from the research; you finalize wording and defaults)

**Project:** name, decision statement, goals (any combination of time savings, data quality, decision speed, risk reduction), currency, horizon (default 3 years), discount rate (default 10%), a free-text **"other"** box for anything not asked, project description file (pdf/md/docx), and data files each with a required user-written description.

**Costs (all goals):** one-time vendor/license/integration/migration, one-time internal labor (FTE-months x rate), training and change management, annual run cost, annual internal support, cost basis (quoted / estimated / assumed, drives the uplift 15 / 30 / 50%), go-live delay (months), a do-nothing baseline.

**Time savings:** staff affected; minutes per task before and after and tasks per week (or hours saved per person per week directly); weeks per year (default 48); loaded hourly cost (if only salary, loaded is about 1.35x); adoption by year (e.g. 60 / 85 / 90, must be 0-100); recapture share (default 50%); documented cash reduction if any (only this counts as hard savings).

**Data quality:** events or records per year; errors before and after; cost per error (or cost per clean unit with the Rule of Ten multiplier, default 10); which cost types (rework, escalation, expedite, customer credit) so we do not double count with time savings.

**Decision speed:** decisions per year; days to decide before and after; cost of delay per day and its basis (revenue deferred, cost continuing, risk exposure, opportunity lost). Ask for a dated example decision. Cost of delay is hard to estimate; label tier honestly.

**Risk reduction:** event type; events per year before and after (fractions allowed, e.g. 0.25 = once in four years); loss per event (or asset value x exposure %); who bears the cost (organization or customer, shown separately).

**Measurement plan (per driver):** how achievement will be measured after launch (before/after, survey, audit, system report), baseline and source, owner, how often. The report prints this.

## Defaults you own (I2)

Hardcoded default for every input, each with a **source and a tier**, shown to the user as labeled proxies they can accept. Research anchors:

- Discount rate 10% (Forrester TEI study; organizations typically 8-16%).
- Recapture 50% (Nucleus productivity correction factor 0.5 default; 0.7-0.9 sales, 0.5 or less marketing).
- Rule of Ten multiplier 10 (Redman).
- Cost uplift 15 / 30 / 50% by cost basis (Forrester 10-15%; Flyvbjerg and Budzier mean IT cost overrun 27%; team judgment).
- Haircut bands (README decision 3).
  If a default has no source, mark it `team assumption`. The Sprint 4 spec says no unapproved universal defaults; this is resolved through team goals (Zihao, Q2): defaults are labeled proxies, never silent.

## Form file (I3 / Ag1 / I6)

JSON, one per project, stored opaquely by Zihao (`project_forms.form_json`), validated against a shared TypeScript type. Required top level: `version`, `goals[]`, `currency`, `horizon_years`, `inputs[]`, `file_descriptions{}`, `other_notes`, `measurement_plan{}`, `asked[]` (log of questions already asked, so nobody asks twice). The type lives in the repo's shared types; propose changes to it by PR.

## Upload (I5, Q7)

Files are read as they are; each file group has a required description. The assistant opens a file only if the description cannot answer, and **must quote the passage** it used so the user can confirm. File size and count limits depend on Gemini limits (Q7, Q8, Eli); until set, cap uploads and say so in the UI.

## Rules that touch your UI

- Percentages 0-100, no negatives, counts are integers. Reject 105% adoption inline (Priya's example) and keep the previous accepted value.
- "Not sure" offers: use labeled proxy, or exclude. Excluded benefits are listed as **unquantified**, never zero.
- Show tier and backing status on each card so users see why an input is weak.
- Do not store mock forms as real projects.

## Collaboration

- **Eli (assistant):** agree the form file format and the card contract first (due Wed noon; late now).
- **Eli (engine and assistant):** your input list per goal is the `ROI.md` section 3 list; keep them identical.
- **Zihao:** field list for tables (Ag6) and the file-to-input link (`Backing.source_file_id`).

## Tests and fixtures to design with

Sprint 4 fixture (10 staff x 5 h x 40 wk x $50 = $100,000; adoption 50%, recapture 50%, haircut 20% gives $20,000) and the Priya scenario for realistic values. Priya's published headline is not consistent with her own components; use it for form examples only.

## Open questions

1. Exact required-vs-optional list per goal and combination.
2. Where defaults live (team goals vs hardcoded).
3. Upload limits (Q7).
4. Do we ask backing for every input or only effect inputs? Recommend only effect inputs plus costs.
