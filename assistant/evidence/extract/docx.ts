// DOCX text: body paragraphs (with their heading path) and table rows, in document order. Headers,
// footers, comments and footnotes are not read. Deleted text from tracked changes is not read.
// Text boxes are read once (the compatibility fallback copy is skipped).
import { SaxParser, localName } from "./sax";
import {
  ExtractError,
  type PageOrSheet,
  type Segment,
  type SegmentSink,
} from "./types";
import { ZipBudget, readSmallText, readZipDirectory, streamText } from "./zip";

interface Para {
  text: string;
  style: string;
  outline: number | null;
}
interface Cell {
  paras: string[];
}

function headingLevels(xml: string): Map<string, number> {
  const out = new Map<string, number>();
  let id = "";
  const p = new SaxParser({
    open: (n, a) => {
      const l = localName(n);
      if (l === "style") id = a["w:styleId"] ?? a["styleId"] ?? "";
      else if (l === "name" && id) {
        const v = a["w:val"] ?? a["val"] ?? "";
        const m = /^heading\s*(\d)$/i.exec(v);
        if (m) out.set(id, Number(m[1]));
        else if (/^title$/i.test(v)) out.set(id, 1);
      }
    },
    close: (n) => {
      if (localName(n) === "style") id = "";
    },
    text: () => {},
  });
  p.write(xml);
  p.end();
  return out;
}

export function extractDocx(
  data: Uint8Array,
  sink: SegmentSink,
): PageOrSheet[] {
  const dir = readZipDirectory(data);
  const budget = new ZipBudget();
  const doc = dir.get("word/document.xml");
  if (!doc)
    throw new ExtractError("BAD_DOCUMENT", "The file has no word/document.xml");
  const stylesEntry = dir.get("word/styles.xml");
  const levels = stylesEntry
    ? headingLevels(readSmallText(data, stylesEntry, budget, 8 * 1024 * 1024))
    : new Map<string, number>();

  const path: string[] = []; // heading path by level
  const paras: Para[] = [];
  let bodyN = 0;
  let tableN = 0;
  let tableDepth = 0;
  let rowN = 0;
  let rowCells: string[] = [];
  const cellStack: Cell[] = [];
  let inT = false;
  let fallback = 0;
  let stopped = false;
  const tables: PageOrSheet[] = [];

  const headingPath = () => path.filter(Boolean).join(" > ");

  const emitPara = (p: Para) => {
    const text = p.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    if (cellStack.length > 0) {
      (cellStack[cellStack.length - 1] as Cell).paras.push(text);
      return;
    }
    bodyN++;
    const level =
      levels.get(p.style) ?? (p.outline !== null ? p.outline + 1 : 0);
    if (level > 0 && text.length <= 200) {
      path.length = level - 1;
      path[level - 1] = text;
    }
    const heading = headingPath();
    const seg: Segment = {
      loc: `p${bodyN}`,
      text,
      ...(heading ? { heading } : {}),
    };
    if (!sink.add(seg)) {
      stopped = true;
      parser.stop();
    }
  };

  const parser: SaxParser = new SaxParser({
    open: (n, a) => {
      const l = localName(n);
      if (l === "Fallback") {
        fallback++;
        return;
      }
      if (fallback > 0) return;
      if (l === "p") paras.push({ text: "", style: "", outline: null });
      else if (l === "pStyle" && paras.length)
        (paras[paras.length - 1] as Para).style = a["w:val"] ?? a["val"] ?? "";
      else if (l === "outlineLvl" && paras.length) {
        const v = Number(a["w:val"] ?? a["val"]);
        if (Number.isInteger(v) && v >= 0 && v < 9)
          (paras[paras.length - 1] as Para).outline = v;
      } else if (l === "t") inT = true;
      else if ((l === "tab" || l === "br" || l === "cr") && paras.length)
        (paras[paras.length - 1] as Para).text += " ";
      else if (l === "noBreakHyphen" && paras.length)
        (paras[paras.length - 1] as Para).text += "-";
      else if (l === "tbl") {
        tableDepth++;
        if (tableDepth === 1) {
          tableN++;
          rowN = 0;
          tables.push({ name: `table ${tableN}`, kind: "section", rows: 0 });
        }
      } else if (l === "tr" && tableDepth === 1) {
        rowN++;
        rowCells = [];
      } else if (l === "tc") cellStack.push({ paras: [] });
    },
    close: (n) => {
      const l = localName(n);
      if (l === "Fallback") {
        fallback = Math.max(0, fallback - 1);
        return;
      }
      if (fallback > 0) return;
      if (l === "t") inT = false;
      else if (l === "p") {
        const p = paras.pop();
        if (p) emitPara(p);
      } else if (l === "tc") {
        const c = cellStack.pop();
        if (!c) return;
        const text = c.paras.join(" ");
        if (cellStack.length > 0) {
          if (text) (cellStack[cellStack.length - 1] as Cell).paras.push(text);
        } else rowCells.push(text);
      } else if (l === "tr" && tableDepth === 1) {
        const nonEmpty = rowCells.some((c) => c !== "");
        if (nonEmpty) {
          let text = "";
          const cells: NonNullable<Segment["cells"]> = [];
          rowCells.forEach((c, i) => {
            if (i > 0) text += " | ";
            cells.push({
              a: `t${tableN}r${rowN}c${i + 1}`,
              s: text.length,
              e: text.length + c.length,
            });
            text += c;
          });
          const heading = headingPath();
          const t = tables[tables.length - 1];
          if (t) t.rows = (t.rows ?? 0) + 1;
          if (
            !sink.add({
              loc: `t${tableN}r${rowN}`,
              text,
              cells,
              ...(heading ? { heading } : {}),
            })
          ) {
            stopped = true;
            parser.stop();
          }
        }
        rowCells = [];
      } else if (l === "tbl") tableDepth = Math.max(0, tableDepth - 1);
    },
    text: (s) => {
      if (inT && fallback === 0 && paras.length) {
        const p = paras[paras.length - 1] as Para;
        if (p.text.length < 20_000) p.text += s;
      }
    },
  });

  streamText(data, doc, budget, (s) => {
    parser.write(s);
    return !stopped;
  });
  if (!stopped) parser.end();
  if (bodyN === 0 && tableN === 0 && sink.segments.length === 0)
    sink.warn("No text was found in the document");
  return tables;
}
