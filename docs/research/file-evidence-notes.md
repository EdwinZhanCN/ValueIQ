# File evidence: design notes (feature/93-file-evidence)

Author: Eli's session with Claude. Status: built on a branch, not reviewed. Issue: #93 (Q7 file limits). Reviewer for storage and limits: Zihao.

## What it does

The assistant can read the files a project uploaded (mostly Word and Excel; also PDF, markdown, text, CSV and TSV) and propose structured backing for engine inputs. Every quote is checked in code against the file before anyone sees it, and nothing is applied until the user accepts the proposal and confirms the quote.

Flow: upload (unchanged) -> `getExtractedText` (deterministic, cached in R2) -> `read_project_file` (model reads a bounded excerpt) or `find_evidence(file_id, input_id)` (one cheap-model call, then verification in code) -> verified candidates with `propose_backing` proposals -> the user accepts and confirms the quote -> `applyProposal` changes a copy of the form.

## Where the code is

| Piece                                      | File                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Limits (one place)                         | `assistant/evidence/limits.ts`                                                                                 |
| Extraction (no Cloudflare imports)         | `assistant/evidence/extract/` (`zip.ts`, `sax.ts`, `docx.ts`, `xlsx.ts`, `plain.ts`, `pdf.ts`, `index.ts`)     |
| Excerpts and rendering                     | `assistant/evidence/text.ts`                                                                                   |
| Extractor and verification                 | `assistant/evidence/find.ts`, `assistant/evidence/completer.ts`; `generateStructured` in `assistant/gemini.ts` |
| Tools                                      | `read_project_file`, `find_evidence` in `assistant/tools.ts` (async, run through `callToolDef`)                |
| Host interface for the tools               | `assistant/evidence/host.ts` (`FileEvidenceHost`, passed as `ctx.files`)                                       |
| Server layer (access, scoping, cache)      | `app/server/file-text.server.ts`: `getExtractedText`, `readProjectFileForModel`, `makeFileHost`                |
| Prompt and tool list for the evidence step | `EVIDENCE_SYSTEM`, `EVIDENCE_TOOLS` in `assistant/prompts.ts` (not part of `ASSISTANT_TOOLS`)                  |
| Tests                                      | `assistant/tests/evidence-*.test.ts`, `app/server/tests/file-text.test.ts` (KPI K17 in `pnpm test:engine`)      |
| Manual live check                          | `node assistant/scripts/live-evidence.mjs` (or `--dry`)                                                        |

Nothing in the Worker entry, the agent or the workflow calls this yet. To use it: in the agent, build `makeFileHost({ projectId, userId }, geminiCompleter({ apiKey, model: resolveModels(env).assistant }))`, pass it as `files` to `createContext`, offer `EVIDENCE_TOOLS` with `EVIDENCE_SYSTEM`, and show the proposals on a card.

## Extraction

- **DOCX:** body paragraphs (`p1`, `p2`, ...) with the heading path above them; table rows (`t1r2`) with cells joined by `|`. Headers, footers, comments and footnotes are not read. Deleted tracked-change text is skipped. Text-box content is read once.
- **XLSX:** every sheet except `veryHidden`; one segment per non-empty row, located as `Sheet1!A7:F7` (`'Q3 Data'!B2` when the name needs quotes), with the address of every cell. Formulas are read as their stored result (a formula with no stored result is warned about). Dates and percentages are shown the way Excel formats them. The first row of each sheet is kept as `header` so the model sees column labels.
- **PDF:** text per page (`page 3`) through `unpdf`. A scan without a text layer comes back empty with a warning; there is no OCR.
- **md / txt:** paragraphs located by line (`L10-14`), markdown heading paths. **CSV/TSV:** rows with cell addresses (`B7`); the row number is the record number, so a quoted field with a line break shifts it from the physical line.
- Old `.doc`, `.xls`, `.ppt` and `.pptx` are refused with a message to save as `.docx`/`.xlsx` or export a PDF.

`ExtractedText` is `{ file_id, sha256, kind, pages_or_sheets[], segments[{ loc, text, heading?, cells? }], truncated, warnings[] }`. `truncated` is true when any cap left something out.

## Limits chosen (team judgment pending Q7)

| Limit                            | Value                                                                                                                                    | Where                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| File the extractor opens         | 25 MB                                                                                                                                    | `MAX_EXTRACT_FILE_BYTES`; **the upload cap is still 10 MB** (Zihao's)    |
| Suggested per project            | about 10 files and 100 MB                                                                                                                | constants only; **not enforced** (the upload path is Zihao's)            |
| Text kept per file               | 1,000,000 characters, 60,000 segments                                                                                                    | `MAX_TEXT_CHARS`, `MAX_SEGMENTS`                                         |
| XLSX / CSV                       | 30 sheets, 20,000 rows per sheet, 50 columns, 1,000 characters per cell                                                                  | `MAX_SHEETS`, `MAX_ROWS_PER_SHEET`, `MAX_COLS_PER_ROW`, `MAX_CELL_CHARS` |
| PDF                              | 20 MB, 200 pages                                                                                                                         | `MAX_PDF_BYTES`, `MAX_PDF_PAGES`                                         |
| Plain text / CSV decoded         | first 6 MB                                                                                                                               | `MAX_PLAIN_BYTES`                                                        |
| What the model reads per call    | 8,000 characters per `read_project_file` call (paged by `start` / `next_start`, narrowed by `section` or `query`)                        | `READ_EXCERPT_CHARS`                                                     |
| What the extractor model is sent | one call per (file, input), at most 40,000 characters, the most relevant segments when a file is bigger (`coverage.complete` says which) | `EXTRACTOR_CONTEXT_CHARS`                                                |
| Candidates returned              | 5 per call, quotes up to 500 characters                                                                                                  | `EXTRACTOR_MAX_CANDIDATES`, `MAX_QUOTE_CHARS`                            |

## Safety

**Archives.** The zip directory is read by our own small reader (no ZIP64, no encryption, no duplicate names, at most 2,000 entries). An entry is refused when its declared size is over 64 MB, when its ratio is over 200:1 above 1 MB, or when it expands past the size it declared; all parts of one archive together may not expand past 128 MB. Decompression uses fflate's streaming `Inflate` fed 16 KB at a time with a size check after each push, so a lying header cannot cause more than a few MB of extra work.

**XML.** A small push parser. Any `DOCTYPE` or `ENTITY` declaration is refused outright (no external entities, no entity expansion); only the five predefined entities and numeric references are decoded, and an unknown `&name;` stays literal text. Nesting depth is capped at 256 and an unfinished token at 1 MB. Parts are streamed through the parser, so a worksheet is never held in memory whole.

**Prompt injection.**

- File text is never in a system prompt. The extractor sees it only inside `BEGIN-FILE-DATA-<random>` / `END-FILE-DATA-<random>` in the user turn; the marker is fresh per call, so a file cannot forge the end of the block. The system prompt tells the model the block is data and not to follow it.
- Tool outputs from files carry `untrusted: true` and a notice, and are not added to `ToolState.seen`, so a number found in a file can never excuse a number in the narrative.
- `quote`, `location` and `note` are marked `untrusted_fields` in `find_evidence` output. The note is the model's words, cut to one line of at most 160 characters.
- Even a model that obeys a planted instruction changes nothing: `apply_override` needs the host's acceptance, proposals are not applied, and `ask_user` stays disabled. Tests drive a deliberately "fooled" scripted model to show this.

**Verification (the part that makes the quotes trustworthy).** A candidate is kept only if its location resolves in THIS file, the quote appears there word for word after whitespace normalization, and `value_in_quote` has a digit and occurs inside the quote. The location the user sees is derived by code (for example `Pilot!B2:C2`), not copied from the model. `observations` must appear as a number in the text the model saw, and `source_date` needs its year and month in that text, or the field is dropped. `period_months` cannot be checked and is flagged in `unverified_fields` so the card can say "the assistant's reading". Duplicates are removed, results are ranked (value agrees with the form first, then date and sample size), and the count is capped. Rejections are reported as counts and reasons only.

**One more rule.** If the file's number differs from the form's value by more than 1 percent, the candidate is shown but no `propose_backing` proposal is made (`proposal_error: VALUE_DIFFERS_FROM_FORM`). Backing is never attached to a number the file does not state.

**Access.** Every server function takes `{ projectId, userId }`, re-checks team membership with `getProjectMembership`, selects the file by id AND project, and checks the R2 key prefix. A file id from another project, another team, or a missing file answers `FILE_NOT_FOUND`; a non-member gets `ACCESS_DENIED`. `find_evidence` also requires the file to be in the form's `file_descriptions` (the engine's own FOREIGN_FILE rule).

**Logs.** `file_extract`, `file_cache_hit`, `file_read` and `evidence_find` events hold file ids, project ids, hashes, counts and token totals. The Gemini events are the existing ids-and-hashes events. Tests check that no event contains file text or the key.

## Cache

`teams/{teamId}/projects/{projectId}/extracted/{fileId}.json` in the existing FILES bucket. An entry holds the extractor version, the source object's etag and size, the sha256 of the bytes, and either the extracted text or a refusal (so a hostile file is not re-parsed on every call). It is valid while the etag, size and extractor version match; a changed object or a damaged entry is rebuilt. No table, no migration, no new bucket. If a project is deleted, `deleteProjectFiles` removes only the `files` rows' objects: **the `extracted/` objects are not deleted** (Zihao: add a prefix delete, or list by prefix).

## Worker constraints found

Checked by running the extractor inside local `workerd` through `wrangler dev` (a scratch probe, not committed) and by the unit tests:

- **PDF is viable in Workers.** `unpdf` 2.1.0 (a serverless pdf.js build) extracted a two-page PDF in about 200 ms in workerd, so the fallback of sending PDF bytes to Gemini was not needed. It is imported lazily. The probe Worker (extractor plus `unpdf` plus `fflate`) bundles to 4.2 MiB raw / 818 KiB gzip; the current app Worker is 2.4 MB raw / 578 KB gzip, so wiring this in will add roughly that much. Check the plan's size limit when it is wired.
- **XLSX performance.** A 20,000-row by 10-column workbook (850 KB zipped) extracted in about 480 ms in workerd, stopping at the 1,000,000-character cap. The streaming parser keeps memory to the source bytes plus the capped output.
- **A 70 MB-expanding zip** was refused in 1 ms from its declared size.
- **Memory (128 MB).** The largest allocations are the source file (up to 25 MB), the extracted text (up to 1 M characters, about 2 MB) and pdf.js internals for a PDF (limited to 20 MB and 200 pages). Not measured under a real 128 MB limit with a 25 MB file; test that before raising the upload cap.
- **CPU.** Decompression and parsing are synchronous JavaScript; the bounded per-push work and the row, character and page caps are the CPU guard. A cold `unpdf` load was the slowest step in the probe.
- **No `eval`, no Node APIs** in the extractor. Only `crypto.subtle` (SHA-256), `TextDecoder` and `fflate`.

## Dependencies added (Zihao must approve)

| Package  | Version | Why                                                                                                                               | Release age          |
| -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `fflate` | 0.8.3   | Streaming `Inflate` for DOCX and XLSX parts (pure JS, about 8 KB, no dependencies). Also builds the test fixtures                 | published 2026-05-16 |
| `unpdf`  | 2.1.0   | PDF text with page numbers in Workers (bundles a serverless pdf.js). Its optional `@napi-rs/canvas` peer is not installed or used | published 2026-10-30 |

The repo has no `minimumReleaseAge` override and pnpm 11.7.0 accepted both (default one day), so they comply. Both are runtime dependencies. No other package was added.

## Not done / not tested

- **Real Word and Excel files.** The parsers were written from the OOXML structure and tested on generated files and on a generated PDF only (sources log L3: not opened). Run it on real files from the pilot before the demo. Known gaps: footnotes, headers and footers; content controls and some field results in DOCX; charts and pivot caches; very old or unusual number formats in XLSX.
- **Live Gemini.** No key was used. Run `GEMINI_API_KEY=... node assistant/scripts/live-evidence.mjs`. Unknowns it settles: whether Gemini 3.5 flash lite accepts the structured-output schema (`CANDIDATES_SCHEMA` uses only object, array, string, integer, minimum, maximum, minLength, maxLength), the quality of its candidates, and the token cost.
- **No UI.** Nothing renders proposals; the form's `file_descriptions` must list the uploaded file ids for `find_evidence` to run.
- **No OCR** for scanned PDFs, no `.doc`/`.xls`.
- **Not wired** into the agent or the run workflow.

## Open decisions

1. **Q7 limits.** Confirm 25 MB per file, about 10 files and 100 MB per project. Today only the 10 MB upload cap is enforced; the extractor accepts up to 25 MB. Raising the upload cap and adding the project caps belongs in `files.server.ts` (Zihao).
2. **`extracted/` cleanup** when a file or project is deleted (see Cache).
3. **Should an accepted file value fill the input?** `applyProposal` for backing never changes `value`, and `find_evidence` makes no proposal when the file's number differs from the form's. If the form value is empty (`FORM_VALUE_UNKNOWN`), the card could offer "use 12.4 from the file" as a separate, user-confirmed value proposal. Not built.
4. **`note` and `period_months`** are the model's words and reading. Keep them on the card with a "check this" label, or drop them.
5. **Tolerance** for "agrees with the form" is 1 percent; the percent-versus-fraction case (15 versus 0.15) is not handled.
6. **Preflight** keeps its three tools. Decide whether the evidence step runs as part of preflight or as its own step with its own card.

## What Zihao must review

- The two new dependencies (above).
- `app/server/file-text.server.ts`: access check, project scoping and the R2 key-prefix check; cache keys under `extracted/`; the missing `extracted/` cleanup.
- The 25 MB and per-project limits (Q7) and whether uploads should enforce them.
- That `app/server/tests/cf-workers-stub.ts` now also stubs `env.FILES` and `env.GEMINI_API_KEY` for unit tests.
- Worker size and memory when this is wired into the agent.
