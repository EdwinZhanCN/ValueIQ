/**
 * What Intake shows for an uploaded file: whether it could be read, a short
 * count ("2 sheets, 47 rows"), and the first passages of each sheet or page
 * as plain text. Pure, so the route and its tests share it.
 */
import type { ExtractedText } from "../../assistant/evidence/extract/types";

export type FileReadSummary =
  | {
      ok: true;
      kind: ExtractedText["kind"];
      /** "2 sheets, 47 rows", "2 pages", "12 passages". */
      text: string;
      preview: { loc: string; text: string }[];
      truncated: boolean;
      warnings: string[];
    }
  | { ok: false; code: string; reason: string };

const PREVIEW_PER_PART = 6;
const PREVIEW_PARTS = 6;
const PREVIEW_CHARS = 200;

const count = (n: number, word: string) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

/** Which sheet or page a segment belongs to ("Summary!A3:B3" → "Summary"). */
function partOf(loc: string): string {
  const bang = loc.indexOf("!");
  if (bang >= 0) return loc.slice(0, bang);
  return /^page \d+$/.test(loc) ? loc : "";
}

export function summarizeRead(x: ExtractedText): FileReadSummary {
  const sheets = x.pages_or_sheets.filter((p) => p.kind === "sheet");
  const pages = x.pages_or_sheets.filter((p) => p.kind === "page");
  const text =
    x.kind === "xlsx"
      ? `${count(sheets.length, "sheet")}, ${count(
          sheets.reduce((n, s) => n + (s.rows ?? 0), 0),
          "row",
        )}`
      : x.kind === "pdf"
        ? count(pages.length, "page")
        : x.kind === "csv" || x.kind === "tsv"
          ? count(x.segments.length, "row")
          : count(x.segments.length, "passage");
  const groups = new Map<string, { loc: string; text: string }[]>();
  for (const s of x.segments) {
    const key = partOf(s.loc);
    const list = groups.get(key) ?? [];
    if (!groups.has(key)) {
      if (groups.size >= PREVIEW_PARTS) continue;
      groups.set(key, list);
    }
    if (list.length < PREVIEW_PER_PART)
      list.push({ loc: s.loc, text: s.text.slice(0, PREVIEW_CHARS) });
  }
  return {
    ok: true,
    kind: x.kind,
    text: x.truncated ? `${text} (partly read)` : text,
    preview: [...groups.values()].flat(),
    truncated: x.truncated,
    warnings: x.warnings.slice(0, 5),
  };
}

const REASONS: Record<string, string> = {
  UNSUPPORTED_TYPE: "this file type is not read",
  TOO_LARGE: "the file is too large to read",
  FILE_UNREADABLE: "the file looks damaged or is not what its name says",
};

export function unreadable(code: string, message: string): FileReadSummary {
  return { ok: false, code, reason: REASONS[code] ?? message };
}
