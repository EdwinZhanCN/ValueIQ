# Engine-sample consumer

Ryan supplied [PR #123](https://github.com/EdwinZhanCN/ValueIQ/pull/123) to unblock the output views. Source branch: `feature/83-sample-engine-output`; inspected head: `f93cb8b446990f0afa922bdb6ced306b590f2a9e`. The [README](../samples/README.md), [result](../samples/sample-result.json) and [gap list](../samples/sample-gap-list.json) are copied without changes. The pull request was open at inspection; this work does not approve or merge it.

## What is implemented

- `/workspace` or `/workspace?view=results`: read-only Numbers, Show the math, Charts and Report sections. The report download is a fixed, offline-generated PDF from the same sample.
- `/workspace?view=gaps`: the ranked evidence list with current/reachable confidence and a target-field link. It has no financial headline or report download.
- `/workspace?view=intake&from=gap&input=hours_saved_per_staff_week`: an explicit pending-intake handoff, preserving the requested destination without pretending a saved form exists.
- `/workspace?view=chat`: the previous vendored agent UI example.

Every sample preview and its PDF say STUB. The public preview calls no engine or storage API. Protected project pages now use the separate [persisted output pipeline](../../output-pipeline.md), with the shared version 1 runtime validator; executable engine integration remains pending.

## Formatting and ownership

The sample's ROI values are already percentages: `202.88` renders as `202.9%`, not `20,288%`. Confidence/share values are ratios: `0.935` renders as `93.5%`. Money uses two decimals, displayed percentages one decimal, with Intl's default half-expand formatting. A null value is distinct from zero; payback text is displayed verbatim. No UI or PDF function recalculates NPV, ROI, payback, totals, haircuts, confidence or scenario outputs. Only chart coordinates and number presentation are calculated.

`Step.label` and `Step.by_year`, `Driver.label` and `Driver.included`, and `sensitivity.x_labels` are consumed directly. Year zero cash flow is retained. Narrative text and references are preserved; on the page, bracketed references link to the supplied math/cost rows.

Hard NPV remains negative while capacity-inclusive NPV is positive. Hard savings, capacity value and expected avoided loss are labeled distinctly. In this particular sample, `cash_flows.benefits_capacity` includes both time capacity and avoided loss, and `net`/`cumulative` are capacity-inclusive. The consumer does not derive hard-only net flows.

## Remaining handoffs

- The waterfall payload supplies successive levels, not precomputed floating-bar endpoints. The preview accurately renders those levels and does not invent reduction values. A true floating waterfall needs the agreed engine endpoints and financial basis/period metadata.
- Step `inputs` arrays are empty. The page and PDF disclose this rather than inventing an entered-input snapshot or evidence attachments.
- Protected project pages now retrieve persisted runs and return to saved opaque JSON with answers preserved. Structured intake and starting a new executable run remain pending; O6 is partial.
- The public sample PDF is fixed and generated offline. Protected projects now generate a fixed-template PDF on the Worker and save/download it through R2 with immutable run pinning. Chart/section selection remains open.
- Ryan confirmed Cloudflare R2 as the storage service in this session. PDF bytes belong in the integration plan's private `FILES` bucket, with report metadata in D1. Zihao owns the bucket/binding, project access checks and storage APIs; the output slice does not create another storage service or public object URL.
- A shared runtime validator and null/zero/gate rejection tests now exist. Final engine-owner alignment and broader warning fixtures remain open; the supplied samples do not establish all possible output states.

## Generate the sample report

Use the temporary libraries and licensed static fonts from the [PDF preview instructions](pdf-preview/README.md):

```sh
node docs/research/output/pdf-preview/generate.mjs --runtime /tmp/valueiq-output-pdf-spike --fonts /tmp/valueiq-output-pdf-spike --sample docs/research/samples/sample-result.json --output docs/research/output/pdf-preview/sample-engine-report.pdf
```

The exporter rejects a gap-list payload; a failed confidence gate must not become an assessment report. The app bundles the PDF as a static download asset. Regenerate it whenever the copied result changes, and compare the exported values against that file.

## Verification recorded

On 2026-11-05, `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test:smoke` passed. The real local Worker smoke test checks the supplied NPV signs/amounts, ROI percentage formatting, STUB labels, gap links and absence of a gap headline/report download.

Local Chrome checks passed at desktop and 390px mobile widths: result figures, math rows, sensitivity selection, sample PDF download, gap-state suppression, target-field navigation/back, no page-level horizontal overflow and no browser errors. The downloaded PDF bytes match the bundled artifact. PDF text extraction verifies both ROI definitions, headline values, no-payback text, audit refs and STUB on every page; representative pages were visually reviewed. The sample exporter rejected the gap file without creating a report.

Copied source file blob hashes match PR #123. Updated documentation links and changed-file formatting pass. The subsequent pipeline adds local saved-form round trips, R2 generation/download and access tests as described in the handoff document. The subsequent release includes the pushed engine library and verifies its computed result/gap outputs against the consumer. Worker orchestration remains pending.
