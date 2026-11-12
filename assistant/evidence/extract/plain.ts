// Plain text, markdown, CSV and TSV. Only the first MAX_PLAIN_BYTES of a file are decoded, so a
// huge text file cannot exhaust memory; the rest is reported as truncated.
import {
  MAX_COLS_PER_ROW,
  MAX_CELL_CHARS,
  MAX_ROWS_PER_SHEET,
  MAX_SEGMENT_CHARS,
} from "../limits";
import { indexToCol } from "./xlsx";
import type { PageOrSheet, Segment, SegmentSink } from "./types";

export const MAX_PLAIN_BYTES = 6 * 1024 * 1024;

export function decodePlain(data: Uint8Array, sink: SegmentSink): string {
  let bytes = data;
  if (bytes.length > MAX_PLAIN_BYTES) {
    bytes = bytes.subarray(0, MAX_PLAIN_BYTES);
    // do not cut a UTF-8 sequence in half
    let end = bytes.length;
    while (end > 0 && ((bytes[end - 1] as number) & 0xc0) === 0x80) end--;
    if (end > 0 && (bytes[end - 1] as number) >= 0xc0) end--;
    bytes = bytes.subarray(0, end);
    sink.partial = true;
    sink.warn(
      `Only the first ${Math.round(MAX_PLAIN_BYTES / 1024 / 1024)} MB of the file is read`,
    );
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    sink.warn("The file is not valid UTF-8; read as Windows-1252");
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function extractText(
  data: Uint8Array,
  kind: "txt" | "md",
  sink: SegmentSink,
): PageOrSheet[] {
  const text = decodePlain(data, sink);
  const lines = text.split(/\r\n|\n|\r/);
  const path: string[] = [];
  let start = 0;
  let buf: string[] = [];
  let more = true;

  const flush = (endLine: number) => {
    if (buf.length === 0) return;
    const body = buf.join("\n").trim();
    buf = [];
    if (!body) return;
    const heading = path.filter(Boolean).join(" > ");
    const loc =
      start + 1 === endLine ? `L${endLine}` : `L${start + 1}-${endLine}`;
    if (!sink.add({ loc, text: body, ...(heading ? { heading } : {}) }))
      more = false;
  };

  for (let i = 0; i < lines.length && more; i++) {
    const line = lines[i] as string;
    const h = kind === "md" ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      flush(i);
      const level = (h[1] as string).length;
      path.length = level - 1;
      path[level - 1] = (h[2] as string).slice(0, 200);
      start = i;
      buf = [line];
      flush(i + 1);
      start = i + 1;
      continue;
    }
    if (line.trim() === "") {
      flush(i);
      start = i + 1;
      continue;
    }
    if (buf.length === 0) start = i;
    buf.push(line);
    if (buf.join("\n").length >= MAX_SEGMENT_CHARS) {
      flush(i + 1);
      start = i + 1;
    }
  }
  if (more) flush(lines.length);
  return [];
}

/** RFC 4180 records with quoted fields; delimiter chosen from the first line. */
export function parseDelimited(
  text: string,
  delimiter: string,
  onRecord: (cells: string[], recordNo: number) => boolean,
): void {
  let field = "";
  let row: string[] = [];
  let inQ = false;
  let recordNo = 0;
  const pushField = () => {
    row.push(
      field.length > MAX_CELL_CHARS ? field.slice(0, MAX_CELL_CHARS) : field,
    );
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          if (field.length <= MAX_CELL_CHARS) field += '"';
          i++;
        } else inQ = false;
      } else if (field.length <= MAX_CELL_CHARS) field += c;
    } else if (c === '"' && field === "") inQ = true;
    else if (c === delimiter) pushField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushField();
      recordNo++;
      if (!onRecord(row, recordNo)) return;
      row = [];
    } else if (field.length <= MAX_CELL_CHARS) field += c;
  }
  if (field !== "" || row.length > 0) {
    pushField();
    recordNo++;
    onRecord(row, recordNo);
  }
}

export function extractDelimited(
  data: Uint8Array,
  kind: "csv" | "tsv",
  sink: SegmentSink,
): PageOrSheet[] {
  const text = decodePlain(data, sink);
  const first = text.slice(0, text.search(/[\r\n]|$/));
  let delimiter = kind === "tsv" ? "\t" : ",";
  if (kind === "csv") {
    const count = (ch: string) => first.split(ch).length - 1;
    if (count(";") > count(",") && count(";") > 0) delimiter = ";";
    else if (count("\t") > count(",") && count("\t") > 0) delimiter = "\t";
  }
  const info: PageOrSheet = { name: "table", kind: "section", rows: 0 };
  parseDelimited(text, delimiter, (cells, no) => {
    if (no > MAX_ROWS_PER_SHEET) {
      info.truncated = true;
      sink.partial = true;
      sink.warn(`Only the first ${MAX_ROWS_PER_SHEET} rows are read`);
      return false;
    }
    let out = "";
    const cs: NonNullable<Segment["cells"]> = [];
    let firstA = "";
    let lastA = "";
    cells.slice(0, MAX_COLS_PER_ROW).forEach((raw, idx) => {
      const t = raw.replace(/\s+/g, " ").trim();
      if (!t) return;
      if (out) out += " | ";
      const a = `${indexToCol(idx + 1)}${no}`;
      if (!firstA) firstA = a;
      lastA = a;
      cs.push({ a, s: out.length, e: out.length + t.length });
      out += t;
    });
    if (cells.length > MAX_COLS_PER_ROW) {
      sink.partial = true;
      sink.warn(`Only the first ${MAX_COLS_PER_ROW} columns of a row are read`);
    }
    if (!out) return true;
    if (info.header === undefined) info.header = out.slice(0, 300);
    info.rows = (info.rows ?? 0) + 1;
    return sink.add({
      loc: firstA === lastA ? firstA : `${firstA}:${lastA}`,
      text: out,
      cells: cs,
    });
  });
  return [info];
}
