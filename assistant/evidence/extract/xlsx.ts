// XLSX text: every sheet, one segment per non-empty row, with the address of every cell. Formulas are
// read as their cached values. Dates and percentages are shown the way a person sees them. The
// sheet XML is streamed through the push parser, so a large sheet is read in bounded memory and
// reading stops at the row cap.
import {
  MAX_CELL_CHARS,
  MAX_COLS_PER_ROW,
  MAX_ROWS_PER_SHEET,
  MAX_SHARED_STRING_CHARS,
  MAX_SHEETS,
} from "../limits";
import { SaxParser, localName } from "./sax";
import {
  ExtractError,
  type PageOrSheet,
  type Segment,
  type SegmentSink,
} from "./types";
import {
  ZipBudget,
  readSmallText,
  readZipDirectory,
  streamText,
  type ZipEntry,
} from "./zip";

export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function indexToCol(i: number): string {
  let s = "";
  let n = i;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const ADDR = /^([A-Z]{1,3})([0-9]{1,7})$/;

export function quoteSheet(name: string): string {
  return /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

// ---------- number formats ----------
type NumKind = "general" | "date" | "percent";
const BUILTIN_DATE = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

function kindOfFormat(code: string): NumKind {
  const plain = code
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "")
    .replace(/_./g, "");
  if (plain.includes("%")) return "percent";
  if (plain.trim().toLowerCase() === "general") return "general";
  if (/[ymdhs]/i.test(plain) && !/^[#0?.,\s]*$/.test(plain)) return "date";
  return "general";
}

function parseStyles(xml: string): NumKind[] {
  const custom = new Map<number, NumKind>();
  const xfs: NumKind[] = [];
  let inCellXfs = false;
  new SaxParserLike(xml, {
    open: (n, a) => {
      const l = localName(n);
      if (l === "numFmt")
        custom.set(Number(a["numFmtId"]), kindOfFormat(a["formatCode"] ?? ""));
      else if (l === "cellXfs") inCellXfs = true;
      else if (l === "xf" && inCellXfs) {
        const id = Number(a["numFmtId"] ?? 0);
        xfs.push(
          id === 9 || id === 10
            ? "percent"
            : (custom.get(id) ?? (BUILTIN_DATE.has(id) ? "date" : "general")),
        );
      }
    },
    close: (n) => {
      if (localName(n) === "cellXfs") inCellXfs = false;
    },
  });
  return xfs;
}

/** Run a whole small XML string through the push parser. */
class SaxParserLike {
  constructor(
    xml: string,
    h: {
      open: (n: string, a: Record<string, string>) => void;
      close?: (n: string) => void;
      text?: (s: string) => void;
    },
  ) {
    const p = new SaxParser({
      open: h.open,
      close: h.close ?? (() => {}),
      text: h.text ?? (() => {}),
    });
    p.write(xml);
    p.end();
  }
}

export function serialToText(serial: number, date1904: boolean): string {
  const days = serial - (date1904 ? 24107 : 25569);
  const d = new Date(Math.round(days * 86_400_000));
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  if (serial > 0 && serial < 1) return iso.slice(11, 16);
  return Number.isInteger(serial)
    ? iso.slice(0, 10)
    : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function cleanNumber(raw: string): string {
  const t = raw.trim();
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  if (t.length <= 15 && !/e/i.test(t)) return t;
  return String(Number(n.toPrecision(15)));
}

function numberText(raw: string, kind: NumKind, date1904: boolean): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw.trim();
  if (kind === "date") return serialToText(n, date1904);
  if (kind === "percent")
    return `${String(Number((n * 100).toPrecision(12)))}%`;
  return cleanNumber(raw);
}

// ---------- package parts ----------
function need(dir: Map<string, ZipEntry>, name: string): ZipEntry {
  const e = dir.get(name);
  if (!e) throw new ExtractError("BAD_DOCUMENT", `The workbook has no ${name}`);
  return e;
}

interface SheetRef {
  name: string;
  rid: string;
  state: string;
}

function parseWorkbook(xml: string): { sheets: SheetRef[]; date1904: boolean } {
  const sheets: SheetRef[] = [];
  let date1904 = false;
  new SaxParserLike(xml, {
    open: (n, a) => {
      const l = localName(n);
      if (l === "sheet")
        sheets.push({
          name: a["name"] ?? `Sheet${sheets.length + 1}`,
          rid: a["r:id"] ?? a["id"] ?? "",
          state: a["state"] ?? "visible",
        });
      else if (l === "workbookPr")
        date1904 = a["date1904"] === "1" || a["date1904"] === "true";
    },
  });
  return { sheets, date1904 };
}

function parseRels(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  new SaxParserLike(xml, {
    open: (n, a) => {
      if (localName(n) === "Relationship" && a["Id"] && a["Target"])
        m.set(a["Id"], a["Target"]);
    },
  });
  return m;
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ["xl", ...target.split("/")];
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}

function readSharedStrings(
  data: Uint8Array,
  e: ZipEntry,
  budget: ZipBudget,
  sink: SegmentSink,
): string[] {
  const out: string[] = [];
  let chars = 0;
  let cur = "";
  let inSi = false;
  let inT = false;
  let inPh = 0;
  let full = false;
  const p = new SaxParser({
    open: (n) => {
      const l = localName(n);
      if (l === "si") {
        inSi = true;
        cur = "";
      } else if (l === "rPh") inPh++;
      else if (l === "t" && inSi && inPh === 0) inT = true;
    },
    close: (n) => {
      const l = localName(n);
      if (l === "t") inT = false;
      else if (l === "rPh") inPh = Math.max(0, inPh - 1);
      else if (l === "si") {
        inSi = false;
        if (cur.length > MAX_CELL_CHARS) cur = cur.slice(0, MAX_CELL_CHARS);
        chars += cur.length;
        if (chars > MAX_SHARED_STRING_CHARS) {
          full = true;
          sink.partial = true;
          sink.warn("The shared string table is larger than the reading limit");
          p.stop();
          return;
        }
        out.push(cur);
      }
    },
    text: (s) => {
      if (inT && cur.length <= MAX_CELL_CHARS) cur += s;
    },
  });
  streamText(data, e, budget, (s) => {
    p.write(s);
    return !full;
  });
  p.end();
  return out;
}

// ---------- one worksheet ----------
interface Cell {
  col: number;
  addr: string;
  text: string;
}

function readSheet(
  data: Uint8Array,
  e: ZipEntry,
  budget: ZipBudget,
  name: string,
  strings: string[],
  xfs: NumKind[],
  date1904: boolean,
  sink: SegmentSink,
  info: PageOrSheet,
): void {
  let rowNo = 0;
  let rowsSeen = 0;
  let cells: Cell[] = [];
  let colAuto = 0;
  // current cell
  let inC = false;
  let cAddr = "";
  let cType = "";
  let cStyle = -1;
  let cVal = "";
  let cInline = "";
  let inV = false;
  let inIs = false;
  let inT = false;
  let inPh = 0;
  let cHasF = false;
  let noCache = 0;
  let errors = 0;
  let aborted = false;
  let header: string | null = null;
  const q = quoteSheet(name);

  const finishCell = () => {
    inC = false;
    let text = "";
    if (cHasF && cVal.trim() === "" && cType !== "inlineStr") noCache++;
    if (cType === "s") {
      const i = Number(cVal);
      text = Number.isInteger(i) ? (strings[i] ?? "") : "";
    } else if (cType === "inlineStr") text = cInline;
    else if (cType === "str" || cType === "d") text = cVal.trim();
    else if (cType === "b") text = cVal.trim() === "1" ? "TRUE" : "FALSE";
    else if (cType === "e") {
      errors++;
      text = "";
    } else if (cVal.trim() !== "")
      text = numberText(cVal, xfs[cStyle] ?? "general", date1904);
    text = text.replace(/\s+/g, " ").trim();
    if (text === "") return;
    const m = ADDR.exec(cAddr);
    const col = m ? colToIndex(m[1] as string) : colAuto;
    if (col < 1 || col > 16384) return;
    if (cells.length >= MAX_COLS_PER_ROW) {
      sink.warn(`Only the first ${MAX_COLS_PER_ROW} columns of a row are read`);
      sink.partial = true;
      info.truncated = true;
      return;
    }
    cells.push({
      col,
      addr: `${indexToCol(col)}${rowNo}`,
      text: text.length > MAX_CELL_CHARS ? text.slice(0, MAX_CELL_CHARS) : text,
    });
  };

  const finishRow = () => {
    if (cells.length === 0) return;
    let text = "";
    const cs: NonNullable<Segment["cells"]> = [];
    for (const c of cells) {
      if (text) text += " | ";
      cs.push({ a: c.addr, s: text.length, e: text.length + c.text.length });
      text += c.text;
    }
    const first = (cells[0] as Cell).addr;
    const last = (cells[cells.length - 1] as Cell).addr;
    const loc = first === last ? `${q}!${first}` : `${q}!${first}:${last}`;
    if (header === null) {
      header = text.slice(0, 300);
      info.header = header;
    }
    info.rows = (info.rows ?? 0) + 1;
    if (!sink.add({ loc, text, cells: cs })) {
      aborted = true;
      info.truncated = true;
      p.stop();
    }
    cells = [];
  };

  const p: SaxParser = new SaxParser({
    open: (n, a) => {
      const l = localName(n);
      if (l === "row") {
        const r = Number(a["r"]);
        rowNo = Number.isInteger(r) && r > 0 && r <= 1_048_576 ? r : rowNo + 1;
        colAuto = 0;
        cells = [];
        rowsSeen++;
        if (rowsSeen > MAX_ROWS_PER_SHEET) {
          info.truncated = true;
          sink.partial = true;
          sink.warn(
            `Sheet ${name}: only the first ${MAX_ROWS_PER_SHEET} rows are read`,
          );
          aborted = true;
          p.stop();
        }
      } else if (l === "c") {
        inC = true;
        colAuto++;
        cAddr = a["r"] ?? "";
        cType = a["t"] ?? "";
        cStyle = a["s"] !== undefined ? Number(a["s"]) : -1;
        cVal = "";
        cInline = "";
        cHasF = false;
      } else if (inC && l === "v") inV = true;
      else if (inC && l === "is") inIs = true;
      else if (inIs && l === "rPh") inPh++;
      else if (inIs && l === "t" && inPh === 0) inT = true;
      else if (inC && l === "f") cHasF = true;
    },
    close: (n) => {
      const l = localName(n);
      if (l === "v") inV = false;
      else if (l === "t") inT = false;
      else if (l === "rPh") inPh = Math.max(0, inPh - 1);
      else if (l === "is") inIs = false;
      else if (l === "c") finishCell();
      else if (l === "row") finishRow();
    },
    text: (s) => {
      if (inV) {
        if (cVal.length < 64 + MAX_CELL_CHARS) cVal += s;
      } else if (inT && cInline.length < MAX_CELL_CHARS) cInline += s;
    },
  });
  streamText(data, e, budget, (s) => {
    p.write(s);
    return !aborted && !p.isStopped;
  });
  if (!aborted) p.end();
  if (noCache > 0)
    sink.warn(
      `Sheet ${name}: ${noCache} formula cell(s) have no stored result (open and save the file in Excel to fill them)`,
    );
  if (errors > 0)
    sink.warn(
      `Sheet ${name}: ${errors} cell(s) hold an error value and were left out`,
    );
}

export function extractXlsx(
  data: Uint8Array,
  sink: SegmentSink,
): PageOrSheet[] {
  const dir = readZipDirectory(data);
  const budget = new ZipBudget();
  const wb = parseWorkbook(
    readSmallText(data, need(dir, "xl/workbook.xml"), budget),
  );
  const relsEntry = dir.get("xl/_rels/workbook.xml.rels");
  const rels = relsEntry
    ? parseRels(readSmallText(data, relsEntry, budget))
    : new Map<string, string>();
  const stylesEntry = dir.get("xl/styles.xml");
  const xfs = stylesEntry
    ? parseStyles(readSmallText(data, stylesEntry, budget, 8 * 1024 * 1024))
    : [];
  const ssEntry = dir.get("xl/sharedStrings.xml");
  const strings = ssEntry ? readSharedStrings(data, ssEntry, budget, sink) : [];

  const pages: PageOrSheet[] = [];
  if (wb.sheets.length > MAX_SHEETS) {
    sink.warn(`Only the first ${MAX_SHEETS} sheets are read`);
    sink.partial = true;
  }
  for (const sh of wb.sheets.slice(0, MAX_SHEETS)) {
    if (sh.state === "veryHidden") {
      sink.warn(`Sheet ${sh.name} is very hidden and was skipped`);
      continue;
    }
    const target = rels.get(sh.rid);
    const entry = target ? dir.get(resolveTarget(target)) : undefined;
    if (!entry) {
      sink.warn(`Sheet ${sh.name} could not be found in the package`);
      continue;
    }
    const info: PageOrSheet = {
      name: sh.name,
      kind: "sheet",
      ...(sh.state === "hidden" ? { hidden: true } : {}),
    };
    pages.push(info);
    readSheet(
      data,
      entry,
      budget,
      sh.name,
      strings,
      xfs,
      wb.date1904,
      sink,
      info,
    );
    if (sink.full) break;
  }
  return pages;
}
