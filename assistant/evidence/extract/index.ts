// Deterministic text extraction (no model). One entry point: bytes in, `ExtractedText` out.
// No Cloudflare imports, so it runs in Workers and in Node tests.
import {
  DEFAULT_MAX_EXTRACT_FILE_BYTES,
  MAX_SEGMENT_CHARS,
  MAX_SEGMENTS,
  MAX_TEXT_CHARS,
} from "../limits";
import { extractDocx } from "./docx";
import { extractPdf } from "./pdf";
import { extractDelimited, extractText as extractPlain } from "./plain";
import {
  ExtractError,
  SegmentSink,
  type ExtractedText,
  type FileKind,
  type PageOrSheet,
} from "./types";
import { extractXlsx } from "./xlsx";

export * from "./types";
export { colToIndex, indexToCol } from "./xlsx";

/** Bump when extraction output changes, so cached text is rebuilt. */
export const EXTRACTOR_VERSION = 1;

const EXT_KIND: Record<string, FileKind> = {
  txt: "txt",
  text: "txt",
  log: "txt",
  md: "md",
  markdown: "md",
  csv: "csv",
  tsv: "tsv",
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  pdf: "pdf",
};
const MIME_KIND: Record<string, FileKind> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export function detectKind(
  name: string,
  mime: string,
  head: Uint8Array,
): FileKind {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
  if (ext === "doc" || ext === "xls" || ext === "ppt" || ext === "pptx")
    throw new ExtractError(
      "UNSUPPORTED_TYPE",
      ext === "pptx" || ext === "ppt"
        ? "Presentations are not read. Export the slides to PDF or paste the text into a Word file"
        : "Old Office formats are not read. Save the file as .docx or .xlsx",
    );
  const kind =
    EXT_KIND[ext] ?? MIME_KIND[mime.toLowerCase().split(";")[0] ?? ""];
  if (!kind)
    throw new ExtractError(
      "UNSUPPORTED_TYPE",
      "This file type is not read. Use Word, Excel, PDF, Markdown, text or CSV",
    );
  const isZip =
    head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;
  const isPdf =
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46;
  if ((kind === "docx" || kind === "xlsx") && !isZip)
    throw new ExtractError(
      "BAD_ARCHIVE",
      `This is not a valid ${kind.toUpperCase()} file`,
    );
  if (kind === "pdf" && !isPdf)
    throw new ExtractError("BAD_DOCUMENT", "This is not a valid PDF file");
  return kind;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ExtractInput {
  fileId: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  /** Largest file to open. Defaults to the upload cap (10 MB); the server passes its own `MAX_FILE_BYTES`. */
  maxBytes?: number;
}

/** Throws ExtractError for an unsupported, oversized, malformed or hostile file. */
export async function extractFileText(i: ExtractInput): Promise<ExtractedText> {
  const maxBytes = i.maxBytes ?? DEFAULT_MAX_EXTRACT_FILE_BYTES;
  if (i.bytes.length > maxBytes)
    throw new ExtractError(
      "TOO_LARGE",
      `Files over ${Math.round(maxBytes / 1024 / 1024)} MB are not read`,
    );
  const kind = detectKind(i.name, i.mime, i.bytes.subarray(0, 8));
  const sink = new SegmentSink(MAX_TEXT_CHARS, MAX_SEGMENTS, MAX_SEGMENT_CHARS);
  let pages: PageOrSheet[];
  switch (kind) {
    case "docx":
      pages = extractDocx(i.bytes, sink);
      break;
    case "xlsx":
      pages = extractXlsx(i.bytes, sink);
      break;
    case "pdf":
      pages = await extractPdf(i.bytes, sink);
      break;
    case "csv":
    case "tsv":
      pages = extractDelimited(i.bytes, kind, sink);
      break;
    default:
      pages = extractPlain(i.bytes, kind, sink);
  }
  if (sink.segments.length === 0 && sink.warnings.length === 0)
    sink.warn("No text was found in the file");
  return {
    file_id: i.fileId,
    sha256: await sha256Hex(i.bytes),
    kind,
    pages_or_sheets: pages,
    segments: sink.segments,
    truncated: sink.truncated || sink.partial,
    warnings: sink.warnings,
  };
}
