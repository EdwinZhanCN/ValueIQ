// Limits for file evidence. Pure constants (no imports) so the server layer, the tools and the tests
// share one definition. Sizes are team judgment pending Q7 (docs/research/file-evidence-notes.md).

/** Largest file the extractor will open (Eli's suggested per-file cap; the upload cap is still Zihao's). */
export const MAX_EXTRACT_FILE_BYTES = 25 * 1024 * 1024;
/** Suggested project caps (not enforced here; the upload path is Zihao's). */
export const SUGGESTED_MAX_FILES_PER_PROJECT = 10;
export const SUGGESTED_MAX_BYTES_PER_PROJECT = 100 * 1024 * 1024;

// ---- zip (DOCX / XLSX) ----
export const MAX_ZIP_ENTRIES = 2000;
/** Uncompressed bytes of one XML part we are willing to stream. */
export const MAX_PART_BYTES = 64 * 1024 * 1024;
/** Uncompressed bytes of all parts read from one archive. */
export const MAX_TOTAL_PART_BYTES = 128 * 1024 * 1024;
/** Declared uncompressed / compressed ratio above which an entry is refused. */
export const MAX_ZIP_RATIO = 200;
/** Compressed bytes pushed into the inflater at once; bounds the work between two size checks. */
export const INFLATE_CHUNK = 16 * 1024;

// ---- extracted text ----
export const MAX_TEXT_CHARS = 1_000_000;
export const MAX_SEGMENTS = 60_000;
export const MAX_SEGMENT_CHARS = 4_000;
export const MAX_SHEETS = 30;
export const MAX_ROWS_PER_SHEET = 20_000;
export const MAX_COLS_PER_ROW = 50;
export const MAX_CELL_CHARS = 1_000;
export const MAX_SHARED_STRING_CHARS = 8_000_000;
export const MAX_PDF_PAGES = 200;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** Longest tag or text node the XML parser keeps while waiting for the rest of it. */
export const MAX_XML_CARRY = 1024 * 1024;

// ---- what the model sees ----
/** read_project_file: characters returned per call. */
export const READ_EXCERPT_CHARS = 8_000;
/** find_evidence: characters of one file sent to the cheap model in its single call. */
export const EXTRACTOR_CONTEXT_CHARS = 40_000;
export const EXTRACTOR_MAX_CANDIDATES = 5;
export const MAX_QUOTE_CHARS = 500;
