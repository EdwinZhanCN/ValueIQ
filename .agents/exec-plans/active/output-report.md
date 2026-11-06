# Output: results, evidence, report builder and PDF

Status: active - 2026-11-05. Supplied PR #123 samples drive the labeled `/workspace` preview. The local output-pipeline branch now implements authenticated persisted-result retrieval, saved opaque-intake round trips, shared version 1 validation, and fixed-template Worker PDF generation/private R2 persistence. The engine and PR #138 live Worker orchestration are now reconciled with the consumer. A user-facing Start Run control still waits. Structured intake, customizable report choices, owner contract freeze, remote deployment and mockup acceptance remain open. See [the concrete handoff](../../../docs/output-pipeline.md).

Goal: a released run opens an auditable pre-funding estimate, a failed confidence gate opens an actionable gap list, and a user can arrange a report, choose fixed charts and download its stored PDF. All financial values come from the engine.

## Non-goals

- AI-requested charts, external software integrations, cross-project comparisons, share links, JSON export, comments, assumption flagging and evidence-request actions.
- Sliders and report approval are stretch work after O4-O6; neither is required for the demo.
- Engine formulas, thresholds, intake design, identity, tables, buckets and access implementation belong to their existing owners.
- This plan does not lift the current empty-shell or two-route boundaries in `AGENTS.md`. The owning implementation PR must update those boundaries when its prerequisites land.

## Sources and current reality

- The supplied `04-output.md` is the starting brief. The [newer draft](https://github.com/EdwinZhanCN/ValueIQ/blob/feature/110-research-plans/docs/research/plans/04-output.md), blob `996673ad7dab20d059cf6530dbd1a28fbd0ad005`, adds the proposed `RunOutput` type and an abridged sample. It is research context under review, not an implemented runtime contract.
- [Engine plan](https://github.com/EdwinZhanCN/ValueIQ/blob/feature/110-research-plans/docs/research/plans/03-calc-engine.md), blob `54b823308a34eba95511e5b0722b6188a8e5d0bd`, and [ROI section 7](https://github.com/EdwinZhanCN/ValueIQ/blob/feature/110-research-plans/docs/research/ROI.md) establish engine ownership and the proposed output fields. Eli owns the engine; Ryan consumes its output.
- [Architecture](../../../docs/architecture.md) records the merged authentication foundation and local output-pipeline proposal. The engine and Worker orchestration are implemented; live model checks and UI launch wiring remain separate.
- [Integration contract](integration-contract.md) defines run states, the server API names and storage ownership. [Interim foundation](interim-foundation.md) owns sign-in, projects and saved intake.
- [Research and reference cases](../../../docs/research/output/README.md) record source findings, limitations and arithmetic checks.
- The linked [mockup](https://claude.ai/artifact/5U6NQ4wZL2tR1kE71VJBfd) could not be opened with the available browser tool. Screens 06, 06a, 06b and 07 still need visual review. Do not claim a visual match.

## Fixed product scope

Confirmed by Ryan on 2026-11-05:

1. Q9: offer waterfall, driver contribution and sensitivity only; exclude AI-requested charts and external integrations.
2. Q11: Edit Inputs returns to saved intake with answers preserved. Submitting edits creates a new run and retains the earlier result. Claim this use case only after that round trip works. Sliders remain stretch.

Required by the brief:

- Display hard savings and capacity value distinctly. Both ROI definitions must be labeled; never combine ROI, NPV and payback into a score.
- Present a pre-funding estimate label, backing summary and tier counts beside headline figures. STUB is visible on every stub result view and every stub report page.
- Read engine-owned numbers, ordered steps, charts, scenarios, sensitivity, warnings, proxies and overrides. Formatting and chart coordinates are presentation; financial arithmetic, aggregation and confidence ranking remain in the engine.
- A gap list has no financial headline and is an ordinary outcome, with ranked evidence requests and preserved answers on return to intake.
- Include all ten report sections, including the measurement plan. Mandatory evidence and qualifications cannot be removed through report customization.

These are local working decisions. No GitHub comments, approvals or issue closures have been sent from this session.

## Requirements and completion evidence

All output issues below were open when inspected on 2026-11-05. Dates are tracker targets, not new promises.

| Work                                                       | Target  | Required deliverable                                          | Observable completion evidence                                                                                                                                                       |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [O1 #65](https://github.com/EdwinZhanCN/ValueIQ/issues/65) | Nov 4   | Three fixed chart types; explicit units, basis and period     | UI and PDF render the same precomputed series; a contribution series reconciles in engine tests; no free-text chart request                                                          |
| [O2 #66](https://github.com/EdwinZhanCN/ValueIQ/issues/66) | Nov 4   | PDF approach agreed with Zihao                                | Worker spike succeeds, font and pagination behavior checked, storage method arguments and failure behavior acknowledged                                                              |
| [O3 #67](https://github.com/EdwinZhanCN/ValueIQ/issues/67) | Nov 5   | Two or three published cases with inputs and expected answers | Two complete reference ledgers are captured; engine adapter and comparison tests must still pass within 10% for nonzero references                                                   |
| [O4 #68](https://github.com/EdwinZhanCN/ValueIQ/issues/68) | Nov 7   | Numbers, show-the-math and charts; gap-list outcome           | Complete released and gap fixtures render; every displayed metric has provenance; null reasons, confidence, costs and warnings are visible; keyboard and narrow-screen review passes |
| [Z6 #62](https://github.com/EdwinZhanCN/ValueIQ/issues/62) | Nov 7   | Stored PDF through Zihao's access-checked API                 | Authorized save/download round trip returns a parseable PDF; signed-out and other-team requests are refused                                                                          |
| [O5 #69](https://github.com/EdwinZhanCN/ValueIQ/issues/69) | Nov 10  | Arrange the report, select charts, download PDF               | Each chart can be included or excluded; section order changes; downloaded pages retain required evidence, labels and the chosen run's values                                         |
| [O6 #70](https://github.com/EdwinZhanCN/ValueIQ/issues/70) | Nov 10  | Review/back navigation and progress                           | Result and gap-list returns preserve intake; edited answers create a new run; reload restores the saved state; progress reflects run state                                           |
| [O7 #71](https://github.com/EdwinZhanCN/ValueIQ/issues/71) | Stretch | Conservative/aggressive input edits                           | Only after O4-O6; engine reruns and retains computed value, override, reason, author and time                                                                                        |

## Contract review before implementation

### PR #123 consumer slice

Ryan supplied the sample contract in this session, authorizing fixture-backed views before the engine lands. The unmodified sample files are copied from `feature/83-sample-engine-output`, head `f93cb8b446990f0afa922bdb6ced306b590f2a9e`; [consumer notes](../../../docs/research/output/engine-samples.md) record units, additions and limitations. No GitHub approval or merge has been sent.

The new sample resolves the old invalid illustrative release fixture: project confidence 0.935 exceeds 0.85, and the failed gate has its own gap-list file. ROI units are now explicit percentage points in the consumer. Local types are inferred from the supplied JSON rather than freezing a second shared contract. The review table below records broader integration requirements that still need the owning tracks; not every row blocks the read-only preview.

Do not introduce a second result model in the UI. Propose these corrections to Eli's canonical definition in `shared/types.ts` when that owning slice lands; affected owners must acknowledge shared contract changes under the integration contract.

| Finding in the newer output draft                                                                | Required resolution                                                                                                                                                                                                                                                                          | Owner                  |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `RunOutput` has two independent optional payloads                                                | Use a discriminated union and runtime validation: result requires only `result`; gap list requires only `gap_list`. Reject neither/both, unsupported versions and malformed required data visibly. Unknown extra keys may be ignored.                                                        | Eli; Ryan consumes     |
| The illustrative result has project confidence 0.80 against floor 0.85                           | Supply a valid released fixture and a distinct failed-gate fixture. Keep the Sprint 4 arithmetic example as a calculation fixture; it must not bypass the release gate to become a product fixture.                                                                                          | Eli                    |
| The sample is explicitly abridged and omits required arrays, null reasons and driver data        | Supply complete fixtures for released real, released stub and gap-list outputs. Add edge fixtures for zero cost, no payback, negative NPV, dropped drivers and unknown essential costs.                                                                                                      | Eli/Ryan               |
| ROI values have no stated unit; `SensPoint.x` has no unit metadata                               | Specify ratio vs percentage, x-axis units, signed money conventions and year indexing. Proposed: ROI/confidence/share are ratios, `_pct` fields are 0-100, time 0 is undiscounted. Format only after those conventions are fixed.                                                            | Eli                    |
| A single `cash_flows.net` and `cumulative` cannot support both financial bases                   | Identify their basis, or return both bases. Never calculate another net or cumulative series in the UI/PDF. Make clear whether capacity-inclusive already contains hard benefits.                                                                                                            | Eli                    |
| Waterfall points contain only label/value; contribution has no total/basis/period                | Specify whether points are successive levels or deltas. For a true floating waterfall, provide precomputed starts/ends and step refs. Supply financial basis, scenario, period, unit and reconciled total for every series, including the financial-summary cash-flow chart.                 | Eli/Ryan               |
| Steps and cost lines have limited provenance; input values cannot represent null                 | Provide a pinned input/assumption snapshot with IDs, names, entered values or unknown reason, units, source references, tiers/backing where applicable and settings references. Cost lines need timing, source and auditable steps. Do not read today's form to describe yesterday's result. | Eli; input team; Zihao |
| `measurement_plan` has baseline/owner/frequency but no explicit method                           | Confirm joining `Driver.measured_by` supplies the method, or add it to the plan. Missing owner or baseline is visibly unspecified, never invented. Support included and dropped drivers without empty fabricated records.                                                                    | Eli/input team         |
| Result lacks context and current/proposed lifecycle comparison                                   | Define the project/context snapshot and whether lifecycle comparison is in scope. If included, the engine provides comparable totals; the output never derives a comparison.                                                                                                                 | Eli/input team         |
| Narrative is free text, with bracket refs only by convention                                     | Bind numeric mentions to trusted engine values/step refs, or keep generated prose number-free. Validate references before display; an unresolved reference cannot establish backing.                                                                                                         | Eli                    |
| Single TEI risk percentage alongside the evidence haircut is optional                            | Show the existing engine haircut/confidence. Do not apply or invent a second adjustment. Only add a separate display field if the engine defines it and its meaning.                                                                                                                         | Eli/Ryan               |
| `getLatestResult`, `saveReportPdf`, `getReportPdf` have names but no exact argument/return types | Agree request, response, access responsibility, run pinning, report options/version and save-failure behavior before wiring routes. A generation started for run A cannot silently save run B if a newer result arrives.                                                                     | Zihao/Ryan             |

Gate thresholds and ranking are engine decisions. The output validates the agreed contract and displays the released outcome; it does not rerun the confidence formula.

## PDF and chart proposal for O1/O2

Status: fixed-template renderer and private storage are implemented locally for infrastructure-owner review. The Worker reads pinned D1 output, renders graphs/tables, writes the existing `FILES` binding, and records `run_reports`. No remote resources were changed. The exact methods and routes are documented in [output pipeline](../../../docs/output-pipeline.md).

Use a server-only PDF renderer with `pdf-lib`, generating vector charts directly from the engine's prepared data. Use SVG for the web versions of the same three charts and a shared presentation specification for labels, colors and ordering. Chart geometry may scale values to page coordinates; it must not derive another financial value. The PDF can include the required cash-flow chart in the financial summary independently of the three selectable chart types.

The library documents pure JavaScript, embedded fonts and vector drawing; its page API exposes text, line and rectangle operations. A local workerd spike using `pdf-lib` 1.17.1 and `@pdf-lib/fontkit` 1.1.1 generated a nine-page PDF with a static Noto Sans font. Subsetting the existing variable Geist WOFF2 failed; use a tested static font and retain its license. The [research record](../../../docs/research/output/README.md#pdf-compatibility-spike) records the conditions and limits. Production CPU/memory use and the final layout remain unverified. [Library overview](https://pdf-lib.js.org/), [page drawing API](https://pdf-lib.js.org/docs/api/classes/pdfpage), [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).

Proposed generation flow:

1. A project action authorizes the caller and accepts a run ID plus validated section order/chart IDs. It ignores client-submitted result numbers.
2. Load the immutable, supported released result for that project/run. A gap list cannot produce an assessment report. A stub produces a conspicuously labeled stub PDF.
3. Build the ten-section report from that snapshot. Wrap text, repeat table headers, keep headings with content, number pages and embed a licensed font supporting the accepted input characters. Include run ID, generation time and contract/formula/settings/template versions.
4. Generate PDF bytes and call Zihao's `saveReportPdf`. Store in the existing private `FILES` bucket under the integration contract's report key; Zihao owns `run_reports` and the R2 write.
5. Download through `getReportPdf` after project access checks, with a safe filename and PDF content type. Treat generation/storage failures visibly and preserve builder choices for retry; never announce a stored report before save succeeds.

Report ordering is a permutation of the ten required sections. Charts can be toggled individually. Whether the summary/appendix stay anchored is a review detail; section hiding is outside this initial scope. Persisting builder choices across reloads and exact report metadata storage need agreement with Zihao.

Alternatives considered: browser print does not establish the stored-file flow and gives less control of pagination; screenshot charts reduce text/graphic quality; a hosted PDF service adds an external integration; headless-browser rendering introduces a runtime/service decision outside this slice. Revisit the choice if the Worker spike fails, rather than adopting another service implicitly.

## Report contents

| Section                                  | Required content                                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Executive summary                     | Pre-funding/STUB labels; hard and capacity-inclusive NPV/payback; labeled undiscounted and PV ROI; backing and tier counts; benefits by driver; explanation of what the estimate covers |
| 2. Context and assumptions               | Run-pinned inputs, source and settings snapshot; currency, horizon and discount rate; unknown values explicitly identified                                                              |
| 3. Benefits by driver                    | Ref-ID steps and formulas, input values, sources/tiers, annual values, total/PV, haircut/confidence, backing counts and risks                                                           |
| 4. Costs                                 | Line items, source/basis, timing, base, uplift, adjusted values, PV and delay, from engine data                                                                                         |
| 5. Unquantified benefits and flexibility | Excluded/dropped driver, why and one evidence improvement; future options without invented monetary values                                                                              |
| 6. Financial summary                     | Engine cash flows and chart, both financial bases and ROI definitions, payback status and stated discount rate                                                                          |
| 7. Scenarios and sensitivity             | Engine conservative/expected/optimistic results, what moved and prepared sensitivity data                                                                                               |
| 8. Risks                                 | Doing nothing and proceeding, including supplied mitigations                                                                                                                            |
| 9. Measurement plan                      | Per-driver metric, baseline and source, verification method, owner and frequency; missing details labeled                                                                               |
| 10. Appendix                             | Definitions/formulas, linked step refs and sources, confidence ledger, warnings, accepted proxies, recorded overrides and versioned audit trail                                         |

## Execution phases

### Phase 0 - Establish requirements and reference evidence

- [x] Read the brief, local architecture, beliefs and relevant active integration plans.
- [x] Inspect O1-O7, Z6, Q9/Q11 and the newer research draft; record actual implementation gaps.
- [x] Confirm Q9/Q11 scope with Ryan.
- [x] Review the complete Salesloft study and Vermont instructions; capture a second complete published financial ledger.
- [x] Record source-pinned reference data and independently check ledger arithmetic.
- [x] Demonstrate PDF generation, custom static-font embedding, repeated table headers and a long table in an isolated local Worker.
- [x] Create a [uniform report layout preview](../../../docs/research/output/pdf-preview/README.md) with four vector charts, structured tables and eight-page visual review; verify a 13-page pagination stress case. This is a research prototype, not the integrated O5 report builder.
- [x] Consume the supplied PR #123 released/gap samples without altering their numbers; add read-only workspace views and an offline-generated sample PDF.
- [ ] Resolve the contract review with Eli and PDF/storage proposal with Zihao. This document is a review packet, not evidence of their agreement.
- [ ] Obtain accessible mockup screens for visual acceptance.

Exit: one agreed canonical output contract, complete valid fixtures, exact server handoffs and a PDF choice demonstrated in the local Worker.

### Phase 1 - Render fixture-backed output (O4)

The fixture-backed slice and shared version 1 validator are implemented from the supplied sample contract. Align the shared definition with the engine owner before freeze. The pipeline preserves merged run/event/question tables and adds only report metadata and the existing private FILES binding; agent methods remain absent.

- Build results, math, charts and gap-list components against that contract. Mount only through an agreed route; retain STUB labeling for fixture-driven pages.
- Add formatting with half-up rounding (money to two decimals; displayed percentages to one); explain null metrics and use engine-provided payback text.
- Make refs navigable and charts accessible with text/table equivalents. Keep qualifications in mobile layouts and report previews.

Exit: every required fixture renders without deriving metrics; accessible mockups have been compared; result/gap outcomes and all edge cases have observable checks.

### Phase 2 - Connect saved results and intake return (O6)

Local evidence: access-checked pinned/latest retrieval, pending/gap/invalid-state handling, saved JSON preservation/reload, target-key navigation and historical report identity pass the local integration/browser checks. The merged form service and file upload UI are preserved. Structured field navigation and starting a new calculation wait for their executable owners; O6 is therefore still partial.

- After foundation/run APIs land, use access-checked server loading for a specific run or the agreed latest-result selection.
- Connect saved-intake return and target-field focus for gaps. Show actual run progress through the shared run state; no simulated percentages.
- Verify edits/new run/history, reload behavior, pending/no-result states, unsupported output, retrieval errors and stub-to-real replacement.

Exit: a signed-in member opens the saved result, returns without losing answers, changes an answer and gets a new run; other-team and signed-out reads are refused.

### Phase 3 - Report and stored PDF (O1/O2/O5/Z6)

Local evidence: fixed-template generation in workerd, private R2 save/download, owner/member access, outsider/signed-out rejection and immutable historical PDFs pass. Contract/publication tests reject malformed outputs and concurrent terminal overwrites. Selectable builder choices and remote deployment remain open; this phase is not complete.

- Extend the isolated PDF compatibility spike to the actual report layout and measure resource use in local workerd before committing a dependency.
- Implement the builder and server-only renderer after agreement. Wire Zihao's storage APIs; exercise retry/failure states and the selected-run race.
- Parse the saved download to check required sections, numbers, labels, versions and chart choices; visually inspect pagination and rendering. Avoid byte-for-byte PDF assertions because metadata may vary.

Exit: builder choices affect a downloaded stored PDF; every number matches the selected engine snapshot and all ten sections remain; access and failure checks pass.

### Phase 4 - Published comparisons and demo acceptance

- Eli adapts the reference ledgers to engine-level financial tests. Do not manufacture inputs, evidence tiers or extra supported drivers to make a case fit.
- Compare nonzero PV/NPV/`roi_pv` references within 10%; record rounding differences and adopt the project's zero-reference rule when its source is available. Payback uses each publication's precision and convention, not false exactness.
- Separately verify input-to-driver math, release gate and the saved-form-to-report flow. Reference-ledger reproduction alone cannot prove those behaviors.
- Run selected repository checks and a real run on development; record actual evidence before closing requirements. Sliders remain deferred unless this phase and O4-O6 are complete.

## Validation boundaries

- Selection follows [valueiq-select-checks](../../skills/valueiq-select-checks/SKILL.md). Documentation-only work needs formatting, valid links/paths and scripts matching `package.json`; future application changes require the corresponding type/lint/build/Worker/browser checks.
- UI and PDF tests use intentionally non-derivable sentinel metrics to reveal accidental recalculation. Engine tests own sums, confidence, chart reconciliation and the Sprint 4 sensitivity references ($9,417.48 at 3%, $8,181.82 at 10%).
- A failed-gate outcome never exposes a headline or assessment PDF. Undefined ROI differs from zero ROI; zero initial cost differs from no payback; negative values are retained.
- Warnings, tier counts, backing, cash/capacity labels, missing measurement details and STUB survive every display mode and export.
- A report pins run and template identity; later input/settings changes cannot rewrite its contents. No client result payload is trusted for generation.
- Repository checks, published-case checks, visual review, access tests and live integration are separate evidence. Completion requires each applicable layer; passing documentation checks does not mean O1-O6 or Z6 are implemented.
