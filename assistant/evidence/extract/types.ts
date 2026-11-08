// The uniform shape every extractor returns. JSON-safe, no Cloudflare imports.

export type FileKind = "txt" | "md" | "csv" | "tsv" | "docx" | "xlsx" | "pdf";

export interface Segment {
  /** Where the text sits: "p12", "t2r5", "Sheet1!A7:F7", "page 3", "L10-14", "R7". */
  loc: string;
  text: string;
  /** DOCX and md: the nearest heading above the segment. */
  heading?: string;
  /** XLSX and tables: the address of each cell in `text`, in order (cells are joined by " | "). */
  cells?: { a: string; s: number; e: number }[];
}

export interface PageOrSheet {
  /** "Sheet1", "page 3", "table 2" */
  name: string;
  kind: "sheet" | "page" | "section";
  hidden?: boolean;
  rows?: number;
  /** XLSX: the first non-empty row of the sheet (column labels, usually). */
  header?: string;
  truncated?: boolean;
}

export interface ExtractedText {
  file_id: string;
  sha256: string;
  kind: FileKind;
  pages_or_sheets: PageOrSheet[];
  segments: Segment[];
  truncated: boolean;
  warnings: string[];
}

export class ExtractError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_TYPE"
      | "TOO_LARGE"
      | "BAD_ARCHIVE"
      | "ZIP_BOMB"
      | "UNSAFE_XML"
      | "BAD_DOCUMENT"
      | "PDF_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

/** Collects segments under the caps; every extractor writes through one of these. */
export class SegmentSink {
  readonly segments: Segment[] = [];
  readonly warnings: string[] = [];
  /** A hard cap stopped reading: no more segments are accepted. */
  truncated = false;
  /** Something was left out (rows, columns, sheets) but reading went on. */
  partial = false;
  private chars = 0;
  constructor(
    private readonly maxChars: number,
    private readonly maxSegments: number,
    private readonly maxSegmentChars: number,
  ) {}
  get full(): boolean {
    return this.truncated;
  }
  warn(w: string): void {
    if (this.warnings.length < 20 && !this.warnings.includes(w))
      this.warnings.push(w);
  }
  /** false once a cap is hit (the caller should stop reading). */
  add(seg: Segment): boolean {
    if (this.truncated) return false;
    if (seg.text.length > this.maxSegmentChars) {
      seg = { ...seg, text: seg.text.slice(0, this.maxSegmentChars) };
      if (seg.cells)
        seg = {
          ...seg,
          cells: seg.cells.filter((c) => c.e <= this.maxSegmentChars),
        };
      this.warn("Some very long cells or paragraphs were cut");
    }
    if (
      this.segments.length >= this.maxSegments ||
      this.chars + seg.text.length > this.maxChars
    ) {
      this.truncated = true;
      this.warn(
        "The file is larger than the reading limit; the rest was left out",
      );
      return false;
    }
    this.chars += seg.text.length;
    this.segments.push(seg);
    return true;
  }
}
