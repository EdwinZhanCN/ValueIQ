// Builders for DOCX, XLSX, PDF and zip-bomb fixtures, generated in tests (no binary files in git).
import { strToU8, zipSync } from "fflate";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

// ---------- DOCX ----------
export type DocBlock =
  | { p: string; style?: "Heading1" | "Heading2" | "Title" }
  | { table: string[][] }
  | { raw: string };

export function buildDocx(
  blocks: DocBlock[],
  extra: Record<string, Uint8Array> = {},
): Uint8Array {
  const body = blocks
    .map((b) => {
      if ("raw" in b) return b.raw;
      if ("table" in b)
        return `<w:tbl>${b.table
          .map(
            (row) =>
              `<w:tr>${row
                .map(
                  (c) =>
                    `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`,
                )
                .join("")}</w:tr>`,
          )
          .join("")}</w:tbl>`;
      const style = b.style
        ? `<w:pPr><w:pStyle w:val="${b.style}"/></w:pPr>`
        : "";
      return `<w:p>${style}<w:r><w:t xml:space="preserve">${esc(b.p)}</w:t></w:r></w:p>`;
    })
    .join("");
  const document = `${CT}<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
  const styles = `${CT}<w:styles xmlns:w="${W}">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style></w:styles>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${CT}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    ),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(styles),
    ...extra,
  });
}

// ---------- XLSX ----------
export type XCell =
  | string
  | number
  | null
  | { f: string; v: string | number }
  | { f: string } // formula with no cached value
  | { date: number }
  | { pct: number }
  | { err: string };
export interface XSheet {
  name: string;
  rows: XCell[][];
  state?: "hidden" | "veryHidden";
}

const colName = (i: number) => {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export function buildXlsx(
  sheets: XSheet[],
  o: { date1904?: boolean; extra?: Record<string, Uint8Array> } = {},
): Uint8Array {
  const strings: string[] = [];
  const sid = (s: string) => {
    let i = strings.indexOf(s);
    if (i < 0) {
      i = strings.length;
      strings.push(s);
    }
    return i;
  };
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((sh, si) => {
    const rows = sh.rows
      .map((row, ri) => {
        const cells = row
          .map((c, ci) => {
            if (c === null) return "";
            const r = `${colName(ci)}${ri + 1}`;
            if (typeof c === "string")
              return `<c r="${r}" t="s"><v>${sid(c)}</v></c>`;
            if (typeof c === "number") return `<c r="${r}"><v>${c}</v></c>`;
            if ("date" in c) return `<c r="${r}" s="1"><v>${c.date}</v></c>`;
            if ("pct" in c) return `<c r="${r}" s="2"><v>${c.pct}</v></c>`;
            if ("err" in c) return `<c r="${r}" t="e"><v>${esc(c.err)}</v></c>`;
            if (!("v" in c)) return `<c r="${r}"><f>${esc(c.f)}</f></c>`;
            return typeof c.v === "string"
              ? `<c r="${r}" t="str"><f>${esc(c.f)}</f><v>${esc(c.v)}</v></c>`
              : `<c r="${r}"><f>${esc(c.f)}</f><v>${c.v}</v></c>`;
          })
          .join("");
        return cells ? `<row r="${ri + 1}">${cells}</row>` : "";
      })
      .join("");
    files[`xl/worksheets/sheet${si + 1}.xml`] = strToU8(
      `${CT}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    );
  });
  const sst = `${CT}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
    .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
    .join("")}</sst>`;
  const workbook = `${CT}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${o.date1904 ? ' date1904="1"' : ""}/><sheets>${sheets
    .map(
      (s, i) =>
        `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ""} r:id="rId${i + 1}"/>`,
    )
    .join("")}</sheets></workbook>`;
  const rels = `${CT}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_s, i) =>
        `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}</Relationships>`;
  const styles = `${CT}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="10"/></cellXfs></styleSheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${CT}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    ),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(rels),
    "xl/styles.xml": strToU8(styles),
    "xl/sharedStrings.xml": strToU8(sst),
    ...files,
    ...(o.extra ?? {}),
  });
}

// ---------- PDF ----------
/** A minimal valid PDF: one page per entry, one line per string, Helvetica. */
export function buildPdf(pages: string[][]): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length; // returns the object number
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageNums: number[] = [];
  for (const lines of pages) {
    const stream = `BT /F1 12 Tf 14 TL 50 740 Td ${lines
      .map((l) => `(${l.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj T*`)
      .join(" ")} ET`;
    const content = add(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
    pageNums.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`,
      ),
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] =
    `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(out);
}

// ---------- hostile archives ----------
/** A zip whose one entry inflates to `bytes` zeros (compresses to a few KB). */
export function buildBombZip(entryName: string, bytes: number): Uint8Array {
  return zipSync({ [entryName]: new Uint8Array(bytes) }, { level: 9 });
}

/** Rewrite the declared uncompressed size of every entry (central directory and local header). */
export function lieAboutSize(zip: Uint8Array, declared: number): Uint8Array {
  const out = new Uint8Array(zip);
  const dv = new DataView(out.buffer);
  for (let i = 0; i + 4 < out.length; i++) {
    const sig = dv.getUint32(i, true);
    if (sig === 0x02014b50) dv.setUint32(i + 24, declared, true);
    else if (sig === 0x04034b50) dv.setUint32(i + 22, declared, true);
  }
  return out;
}

export const bytesOf = (s: string) => strToU8(s);
