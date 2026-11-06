# Output research and published reference cases

Reviewed: 2026-11-05. Owner: Ryan. Work: [output execution plan](../../../.agents/exec-plans/active/output-report.md), [O3 #67](https://github.com/EdwinZhanCN/ValueIQ/issues/67).

## Question and context

What evidence should a pre-funding report expose, and which published cases can independently check its financial results?

The local app is still a skeleton. The proposed engine contract must support an auditable output without moving calculations into the UI or PDF renderer. The attached brief supplies report requirements; the newer draft in PR #111 supplies a proposed type, not a working engine.

## Sources reviewed

| Source                                                                                                                                                                                                          | Review and relevant locations                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Forrester TEI of Salesloft, September 2022](https://assets.contentstack.io/v3/assets/blt48e9deb40787970b/bltbf1ed1dfe47155f0/660af9c804d34c6763bd9d97/Forrester-Total-Economic-Impact-of-Salesloft-2022-1.pdf) | Full 31-page PDF text reviewed. Printed pp. 9-19: benefits; pp. 21-25: costs; p. 26: summary; p. 27: definitions/timing. PDF page numbers are printed page + 2. SHA-256 is pinned in the data file.                                                          |
| [Vermont IT ABC form instructions, February 2023](https://digitalservices.vermont.gov/sites/digitalservices/files/doc_library/IT_ABC_Instructions_February%202023.pdf)                                          | Full 16-page browser extraction reviewed. PDF pp. 5-6: value and measurement; p. 8: opposing risks; pp. 9-14: proposed/current costs and actual budget reduction. Direct download returned 403; browser extraction was accessible.                           |
| [Forrester TEI of Sage X3, January 2016](https://media.bitpipe.com/io_13x/io_137740/item_1540919/Forrester%20Report.pdf)                                                                                        | Original 22-page study hosted by Bitpipe. Tables 1-7: benefits; table 8: cloud costs; table 9: adjustments; table 10: financial summary. Table pages checked in extracted PDF text; screenshot retrieval failed, so visual table review remains outstanding. |
| [Proposed output draft](https://github.com/EdwinZhanCN/ValueIQ/blob/feature/110-research-plans/docs/research/plans/04-output.md)                                                                                | Blob `996673ad7dab20d059cf6530dbd1a28fbd0ad005`; includes a type and explicitly abridged sample absent from the supplied attachment. Contract findings are in the execution plan.                                                                            |

## Findings

Salesloft connects summary metrics to referenced benefit/cost tables, evidence, risk adjustments and definitions. It reports initial costs at time zero and discounts later flows at year end; displayed rounded lines may not sum exactly. Use its complete ledger as a financial reference, and its traceability as report guidance. Its commissioned composite is not evidence of another project's outcomes. [Study, printed pp. 9-27](https://assets.contentstack.io/v3/assets/blt48e9deb40787970b/bltbf1ed1dfe47155f0/660af9c804d34c6763bd9d97/Forrester-Total-Economic-Impact-of-Salesloft-2022-1.pdf#page=11).

Vermont requires a way to verify each value, compares current/proposed lifecycle costs and asks about proceeding versus doing nothing. Redeployed labor belongs among business values; only eliminated positions or reduced overtime qualify for its labor budget-saving line. This supports the brief's distinct cash/capacity presentation and mandatory measurement plan. We borrow reporting principles, not Vermont's funding rules or local cost defaults. [Instructions, sections 3, 5-8](https://digitalservices.vermont.gov/sites/digitalservices/files/doc_library/IT_ABC_Instructions_February%202023.pdf#page=5).

Sage provides another complete ledger with six benefit lines and four cost lines, including an explicit zero-cost line. Its summary targets are benefits PV 1,722,180, costs PV 620,870, NPV 1,101,310 and rounded PV ROI 177%. The publication's labor terminology does not establish cash realization for ValueIQ. [Study, tables 7, 8 and 10](https://media.bitpipe.com/io_13x/io_137740/item_1540919/Forrester%20Report.pdf#page=13).

Implementation implications: preserve the engine's prepared figures, inputs and evidence together; retain missing data visibly; make each headline traceable to a step; give exported charts the same financial basis and period as their source tables. These are design recommendations for this project.

## Published-case data and comparison method

[published-cases.json](published-cases.json) is a research ledger, not a `RunOutput`, engine input schema or released assessment fixture. Each row contains the publication's already risk-adjusted cash flows for years 0-3 and its published PV. Keep the source rows intact; apply neither another haircut nor another cost uplift to these rows.

For each case, independently sum benefit and cost rows, discount at the stated rate, subtract cost PV from benefit PV and compare PV-based ROI. Compare the engine's eventual `roi_pv`, not its undiscounted ROI. Published percentages are rounded; store them as ratios with their reported precision. A nonzero reference passes the brief's tolerance when `abs(actual - reference) / abs(reference) <= 0.10`. Zero-reference handling remains pending the original Sprint 4 rule; do not silently divide by zero or select an arbitrary tolerance.

| Case               | Independent result from displayed rows                             | Difference from published target                                              |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Salesloft 2022     | Benefits PV 12,104,136.90; costs PV 2,448,508.37; NPV 9,655,628.53 | NPV differs by 1.47; maximum headline relative error is 0.0882% (rounded ROI) |
| Sage X3 cloud 2016 | Benefits PV 1,722,179.82; costs PV 620,871.29; NPV 1,101,308.53    | NPV differs by 1.47; maximum headline relative error is 0.2154% (rounded ROI) |

Verification on 2026-11-05 used Python's standard-library `json` and `decimal` against the committed data: 19 line-item PV checks (one exact zero) and eight nonzero headline comparisons passed within 10%. Salesloft's displayed benefit rows sum to one dollar less than its year-two summary; cost rows agree. Sage's annual rows agree. This is consistent with display rounding; the source values remain unchanged.

Arithmetic checks use these rows independently of any application code. They establish transcription/reconciliation evidence only. Engine comparison tests, raw-input/formula adapters, confidence gate checks and end-to-end UI/PDF checks have not run.

## Assumptions and risks

- These are two distinct vendor-commissioned composite studies, not randomized evidence or business-case promises. The requested count is two or three, so a third case is optional unless one proves unusable.
- Already-adjusted financial ledgers test the generic financial layer. Both studies have six benefit categories while the proposed engine has four driver IDs; mapping every raw benefit formula into those IDs is not established. Eli must decide which comparisons are supported without expanding scope or forcing a misleading mapping.
- Published raw formulas have inconsistencies. For example, Sage table 3 labels 0.02% but uses 0.002 (0.2%); table 4's carrying-cost formula names the after balance although its amount matches the reduction; table 5 and its prose disagree about hours saved. Salesloft's printed `Et` formula does not explain its displayed monetary total. Use the recorded ledger for financial checks and resolve raw-formula adapters explicitly.
- Published assumptions and risk adjustments do not supply ValueIQ backing/tier evidence. Do not label a fixture as gate-passing simply because its arithmetic reproduces a study.
- Published payback claims have limited precision: Salesloft says under six months; Sage says five months. A year-end-only engine cannot claim exact monthly agreement without an agreed timing/interpolation convention.
- Do not use the unreproduced Priya headline from the engine draft as a passing published case.

## Recommended next step

Agree the output contract corrections and complete release/gap fixtures with Eli; review the PDF proposal and spike findings with Zihao. Then adapt these ledgers into engine-level comparison tests and build the fixture-driven views. The execution plan lists exact completion evidence per requirement.

## PDF compatibility spike

Question: can the proposed PDF library generate a multi-page report with an embedded font inside the existing Worker runtime?

On 2026-11-05 an isolated Worker under `/tmp/valueiq-output-pdf-spike` ran through Wrangler 4.131.1 with compatibility date `2026-09-11`, matching the repository. It used `pdf-lib` 1.17.1 and `@pdf-lib/fontkit` 1.1.1 installed only in that temporary directory. No application dependency, binding or result type was added.

Observed evidence:

- `GET /report.pdf` returned HTTP 200, `application/pdf`, 20,827 bytes and nine pages. The response measured 129 ms of elapsed generation time in one local request; this is not a CPU or production performance measurement.
- Python `pypdf` parsed the bytes and extracted all ten required section headings, STUB/pre-funding labels on every page, a 240th table row, repeated headers, supplied chart values, a negative currency value and sample accented/currency characters (`café`, `naïve`, `£`, `€`, em dash).
- Subsetting the repository's variable Geist WOFF2 failed with a fontkit `RangeError` and HTTP 500. Subsetting a static [Noto Sans Regular TTF](https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf) passed. Font SHA-256: `b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5`. Its [SIL Open Font License](https://github.com/notofonts/noto-fonts/blob/main/LICENSE) was read; retain it when bundling the font.
- Rasterized PDF pages 1 and 8 were visually inspected: static-font text, repeated table headers and vector bars rendered. The simple scaffold leaves the appendix heading at the bottom of page 8; the actual renderer still needs heading/content grouping before visual acceptance.

The sample draws vector bars from supplied illustrative values; it is not a full implementation of the selectable charts or report. Unicode coverage is limited to the tested font/sample, not a claim of arbitrary-language support. Line wrapping, final visual layout, all three chart types, storage, access, retries, production limits and integration with a pinned result remain to verify. The temporary PDF is a compatibility artifact only.

### Uniform layout revision

The [retained layout prototype](pdf-preview/README.md) replaces the initial scaffold with shared page furniture, regular/bold typography, metric cards, wrapped and aligned tables, and vector waterfall, contribution, cash-flow and sensitivity charts. It uses an explicitly synthetic presentation fixture, not a proposed replacement for `RunOutput`.

The revised standard preview has eight pages; the stress preview has 13. The section headings stay with their content, table rows paginate with repeated headings, and financial labels are supplied with the fixture. Font glyph coverage is checked before drawing. Standard pages were visually reviewed; the fixed text no longer contains the unsupported minus-sign glyph. Application integration and production acceptance remain open.
