// PDF text with page numbers through unpdf (a serverless build of pdf.js that runs in Workers and
// Node). It is imported on first use, so the 1.7 MB parser is only loaded when a PDF is read.
// Scanned PDFs have no text layer: they come back empty with a warning (no OCR here).
import { MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_SEGMENT_CHARS } from "../limits";
import { ExtractError, type PageOrSheet, type SegmentSink } from "./types";

const CHUNK = Math.min(3000, MAX_SEGMENT_CHARS - 200);

export async function extractPdf(
  data: Uint8Array,
  sink: SegmentSink,
): Promise<PageOrSheet[]> {
  if (data.length > MAX_PDF_BYTES)
    throw new ExtractError(
      "TOO_LARGE",
      `PDFs over ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB are not read`,
    );
  let unpdf: typeof import("unpdf");
  try {
    unpdf = await import("unpdf");
  } catch {
    throw new ExtractError(
      "PDF_UNAVAILABLE",
      "The PDF reader is not available",
    );
  }
  // pdf.js takes ownership of the buffer it is given, so hand it a copy
  let pdf: Awaited<ReturnType<typeof unpdf.getDocumentProxy>>;
  try {
    pdf = await unpdf.getDocumentProxy(new Uint8Array(data), {
      stopAtErrors: false,
    });
  } catch (e) {
    const name = (e as { name?: string }).name ?? "";
    if (name === "PasswordException")
      throw new ExtractError("BAD_DOCUMENT", "The PDF is password protected");
    throw new ExtractError("BAD_DOCUMENT", "The PDF could not be read");
  }
  const pages: PageOrSheet[] = [];
  try {
    const total = pdf.numPages;
    const last = Math.min(total, MAX_PDF_PAGES);
    if (total > last) {
      sink.partial = true;
      sink.warn(`Only the first ${MAX_PDF_PAGES} pages are read`);
    }
    let withText = 0;
    for (let n = 1; n <= last && !sink.full; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      page.cleanup();
      let text = "";
      for (const it of tc.items as { str?: string; hasEOL?: boolean }[])
        if (typeof it.str === "string")
          text += it.str + (it.hasEOL ? "\n" : "");
      pages.push({ name: `page ${n}`, kind: "page" });
      const lines = text
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean);
      if (lines.length === 0) continue;
      withText++;
      let buf = "";
      const flush = () => {
        if (buf.trim()) sink.add({ loc: `page ${n}`, text: buf.trim() });
        buf = "";
      };
      for (const line of lines) {
        if (buf.length + line.length + 1 > CHUNK) flush();
        buf += (buf ? "\n" : "") + line;
        if (sink.full) break;
      }
      flush();
    }
    if (withText === 0)
      sink.warn(
        "No text layer was found; the PDF may be a scan. Scanned PDFs are not read in this version",
      );
  } finally {
    await pdf.loadingTask.destroy();
  }
  return pages;
}
