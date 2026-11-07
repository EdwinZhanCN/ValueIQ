// K17 file evidence: deterministic text extraction (no model, no Cloudflare).
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  ExtractError,
  extractFileText,
  type ExtractedText,
} from "../evidence/extract";
import {
  MAX_COLS_PER_ROW,
  DEFAULT_MAX_EXTRACT_FILE_BYTES,
  MAX_PART_BYTES,
  MAX_ROWS_PER_SHEET,
} from "../evidence/limits";
import {
  buildBombZip,
  buildDocx,
  buildPdf,
  buildXlsx,
  bytesOf,
  lieAboutSize,
} from "./evidence-fixtures";

const run = (name: string, bytes: Uint8Array, mime = "") =>
  extractFileText({ fileId: "f1", name, mime, bytes });
const refused = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(ExtractError);
  expect((e as ExtractError).code).toBe(code);
};
const seg = (x: ExtractedText, loc: string) =>
  x.segments.find((s) => s.loc === loc);

describe("K17 extract: DOCX", () => {
  it("reads paragraphs, heading paths and table rows in order", async () => {
    const x = await run(
      "report.docx",
      buildDocx([
        { p: "Support audit", style: "Heading1" },
        { p: "Findings", style: "Heading2" },
        { p: "Average handling time was 12.4 minutes in Q3." },
        { p: "Tickets sampled: 4,812 & verified <twice>." },
        {
          table: [
            ["Queue", "Minutes"],
            ["Billing", "14"],
          ],
        },
      ]),
    );
    expect(x.kind).toBe("docx");
    expect(x.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(seg(x, "p3")?.text).toBe(
      "Average handling time was 12.4 minutes in Q3.",
    );
    expect(seg(x, "p3")?.heading).toBe("Support audit > Findings");
    expect(seg(x, "p4")?.text).toBe(
      "Tickets sampled: 4,812 & verified <twice>.",
    );
    expect(seg(x, "p4")?.heading).toBe("Support audit > Findings");
    const row = seg(x, "t1r2");
    expect(row?.text).toBe("Billing | 14");
    expect(row?.cells?.map((c) => c.a)).toEqual(["t1r2c1", "t1r2c2"]);
    expect(x.pages_or_sheets[0]?.name).toBe("table 1");
    expect(x.truncated).toBe(false);
  });

  it("skips the compatibility fallback copy of a text box and deleted text", async () => {
    const x = await run(
      "box.docx",
      buildDocx([
        {
          raw: `<mc:AlternateContent><mc:Choice><w:p><w:r><w:t>Box text</w:t></w:r></w:p></mc:Choice><mc:Fallback><w:p><w:r><w:t>Box text</w:t></w:r></w:p></mc:Fallback></mc:AlternateContent>`,
        },
        {
          raw: `<w:p><w:r><w:t>kept</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>`,
        },
      ]),
    );
    expect(x.segments.map((s) => s.text)).toEqual(["Box text", "kept"]);
  });
});

describe("K17 extract: XLSX", () => {
  const book = () =>
    buildXlsx([
      {
        name: "Tickets",
        rows: [
          ["Queue", "Avg minutes", "Share", "Closed", "Total"],
          [
            "Billing",
            14.25,
            { pct: 0.15 },
            { date: 46000 },
            { f: "B2*2", v: 28.5 },
          ],
          [null, null, null, null, null],
          [
            "Returns",
            9,
            { pct: 0.052 },
            { date: 46000.5 },
            { f: "B4*2", v: "text result" },
          ],
          ["Broken", { f: "1/0" }, { err: "#DIV/0!" }],
        ],
      },
      { name: "Q3 Data", rows: [["x"], ["Total errors", 1234567.891234567]] },
      { name: "Secret", rows: [["hidden stuff"]], state: "veryHidden" },
      { name: "Aside", rows: [["side note"]], state: "hidden" },
    ]);

  it("gives every non-empty row a segment with correct cell addresses", async () => {
    const x = await run("t.xlsx", book());
    expect(x.kind).toBe("xlsx");
    const r2 = seg(x, "Tickets!A2:E2");
    expect(r2?.text).toBe("Billing | 14.25 | 15% | 2025-12-09 | 28.5");
    const cells = r2?.cells ?? [];
    expect(cells.map((c) => c.a)).toEqual(["A2", "B2", "C2", "D2", "E2"]);
    // the offsets slice back to the cell text
    expect(cells.map((c) => (r2?.text ?? "").slice(c.s, c.e))).toEqual([
      "Billing",
      "14.25",
      "15%",
      "2025-12-09",
      "28.5",
    ]);
    // an empty row 3 is skipped; row numbers stay the real ones
    expect(seg(x, "Tickets!A4:E4")?.text).toBe(
      "Returns | 9 | 5.2% | 2025-12-09 12:00 | text result",
    );
    expect(seg(x, "Tickets!A1:E1")?.text).toBe(
      "Queue | Avg minutes | Share | Closed | Total",
    );
    expect(
      x.pages_or_sheets.find((s) => s.name === "Tickets")?.header,
    ).toContain("Avg minutes");
  });

  it("quotes sheet names with spaces, trims float noise, and handles gaps in columns", async () => {
    const x = await run("t.xlsx", book());
    const s = seg(x, "'Q3 Data'!A2:B2");
    expect(s?.text).toBe("Total errors | 1234567.89123457");
    const gap = await run(
      "g.xlsx",
      buildXlsx([{ name: "S", rows: [["a", null, "c"]] }]),
    );
    expect(seg(gap, "S!A1:C1")?.cells?.map((c) => c.a)).toEqual(["A1", "C1"]);
  });

  it("reads formulas as cached values, flags missing results, hides very hidden sheets", async () => {
    const x = await run("t.xlsx", book());
    expect(x.segments.some((s) => s.text.includes("hidden stuff"))).toBe(false);
    expect(x.pages_or_sheets.find((s) => s.name === "Aside")?.hidden).toBe(
      true,
    );
    expect(seg(x, "Aside!A1")?.text).toBe("side note");
    expect(seg(x, "Tickets!A5")?.text).toBe("Broken");
    expect(x.warnings.join(" ")).toMatch(/no stored result/);
    expect(x.warnings.join(" ")).toMatch(/error value/);
    expect(x.warnings.join(" ")).toMatch(/very hidden/);
  });

  it("honors the 1904 date system", async () => {
    const x = await run(
      "d.xlsx",
      buildXlsx([{ name: "S", rows: [[{ date: 1 }]] }], { date1904: true }),
    );
    expect(seg(x, "S!A1")?.text).toBe("1904-01-02");
  });

  it("caps rows per sheet and columns per row, reports truncated, keeps memory bounded", async () => {
    const rows = Array.from({ length: MAX_ROWS_PER_SHEET + 50 }, (_, i) => [
      `r${i + 1}`,
      i,
    ]);
    const x = await run("big.xlsx", buildXlsx([{ name: "Big", rows }]));
    expect(x.truncated).toBe(true);
    expect(x.segments).toHaveLength(MAX_ROWS_PER_SHEET);
    expect(x.pages_or_sheets[0]?.truncated).toBe(true);
    expect(x.warnings.join(" ")).toMatch(/first 20000 rows/);

    const wide = await run(
      "wide.xlsx",
      buildXlsx([
        {
          name: "W",
          rows: [
            Array.from({ length: MAX_COLS_PER_ROW + 10 }, (_, i) => `c${i}`),
          ],
        },
      ]),
    );
    expect(wide.segments[0]?.cells).toHaveLength(MAX_COLS_PER_ROW);
    expect(wide.truncated).toBe(true);
  });

  it("stops at the total text cap", async () => {
    const long = "word ".repeat(150).trim();
    const rows = Array.from({ length: 2500 }, (_, i) => [
      `${i}`,
      long,
      long,
      long,
    ]);
    const x = await run("txt.xlsx", buildXlsx([{ name: "T", rows }]));
    expect(x.truncated).toBe(true);
    const total = x.segments.reduce((n, s) => n + s.text.length, 0);
    expect(total).toBeLessThanOrEqual(1_000_000);
  });
});

describe("K17 extract: text, markdown, CSV, TSV, PDF", () => {
  it("txt: paragraphs with line locations; md: heading paths", async () => {
    const t = await run(
      "a.txt",
      bytesOf("First para\nstill first\n\nSecond para"),
    );
    expect(t.segments.map((s) => [s.loc, s.text])).toEqual([
      ["L1-2", "First para\nstill first"],
      ["L4", "Second para"],
    ]);
    const md = await run(
      "a.md",
      bytesOf(
        "# Report\n\nIntro text.\n\n## Numbers\n\nHandling time 12 minutes.\n",
      ),
    );
    expect(
      md.segments.find((s) => s.text.startsWith("Handling"))?.heading,
    ).toBe("Report > Numbers");
  });

  it("csv: quoted fields, embedded newlines, semicolon detection, cell addresses", async () => {
    const x = await run(
      "a.csv",
      bytesOf(
        'Name,Minutes,Note\r\nBilling,14,"said ""fast"", then\nslow"\r\nReturns,9,\r\n',
      ),
    );
    expect(x.segments[0]?.text).toBe("Name | Minutes | Note");
    expect(x.segments[1]?.text).toBe('Billing | 14 | said "fast", then slow');
    expect(x.segments[2]?.cells?.map((c) => c.a)).toEqual(["A3", "B3"]);
    const semi = await run("b.csv", bytesOf("a;b;c\n1;2;3\n"));
    expect(semi.segments[1]?.text).toBe("1 | 2 | 3");
    const tsv = await run("c.tsv", bytesOf("a\tb\n1\t2\n"));
    expect(tsv.segments[1]?.text).toBe("1 | 2");
  });

  it("pdf: text per page with page locations", async () => {
    const x = await run(
      "r.pdf",
      buildPdf([
        ["Incident log summary", "Average resolution time 3.5 days"],
        ["Appendix", "Refunds issued 1,204 (see ledger)"],
      ]),
    );
    expect(x.kind).toBe("pdf");
    expect(x.pages_or_sheets.map((p) => p.name)).toEqual(["page 1", "page 2"]);
    expect(seg(x, "page 1")?.text).toContain(
      "Average resolution time 3.5 days",
    );
    expect(seg(x, "page 2")?.text).toContain(
      "Refunds issued 1,204 (see ledger)",
    );
  });

  it("pdf: an unreadable file is a refusal, not a crash", async () => {
    await refused(run("bad.pdf", bytesOf("%PDF-1.4 garbage")), "BAD_DOCUMENT");
  });
});

describe("K17 extract: hostile and unsupported input is refused", () => {
  it("refuses a zip bomb by declared size, ratio, and by lying about size", async () => {
    const huge = buildBombZip("word/document.xml", MAX_PART_BYTES + 1024);
    await refused(run("a.docx", huge), "ZIP_BOMB");

    // 10 MB of zeros declared honestly: under the size cap but far over the ratio cap
    const ratio = buildBombZip("word/document.xml", 10 * 1024 * 1024);
    await refused(run("b.docx", ratio), "ZIP_BOMB");

    // declares 5 KB but really inflates to 6 MB of zeros
    const lie = lieAboutSize(
      buildBombZip("word/document.xml", 6 * 1024 * 1024),
      5000,
    );
    await refused(run("c.docx", lie), "ZIP_BOMB");
  });

  it("stops reading at the archive total budget", async () => {
    // many small honest XML-ish parts are fine; the budget is exercised by the entry cap
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 2100; i++) files[`f${i}.txt`] = strToU8("x");
    await refused(run("many.docx", zipSync(files)), "ZIP_BOMB");
  });

  it("refuses DOCTYPE and entity declarations (no XXE, no billion laughs)", async () => {
    const laughs = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>&lol2;</w:t></w:r></w:p></w:body></w:document>`;
    await refused(
      run("x.docx", zipSync({ "word/document.xml": strToU8(laughs) })),
      "UNSAFE_XML",
    );
    const xxe = `<!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>`;
    await refused(
      run("y.docx", zipSync({ "word/document.xml": strToU8(xxe) })),
      "UNSAFE_XML",
    );
  });

  it("does not expand unknown entities and decodes only the predefined ones", async () => {
    const x = await run(
      "e.docx",
      buildDocx([
        {
          raw: `<w:p><w:r><w:t>a &amp; b &#65; &#x42; &unknown; &lt;</w:t></w:r></w:p>`,
        },
      ]),
    );
    expect(x.segments[0]?.text).toBe("a & b A B &unknown; <");
  });

  it("refuses non-zip content with a DOCX name, wrong types, and old Office formats", async () => {
    await refused(run("n.docx", bytesOf("hello")), "BAD_ARCHIVE");
    await refused(run("n.xlsx", bytesOf("hello")), "BAD_ARCHIVE");
    await refused(run("old.doc", bytesOf("x")), "UNSUPPORTED_TYPE");
    await refused(run("old.xls", bytesOf("x")), "UNSUPPORTED_TYPE");
    await refused(
      run("pic.png", bytesOf("x"), "image/png"),
      "UNSUPPORTED_TYPE",
    );
    await refused(
      run("noworkbook.xlsx", zipSync({ "a.xml": strToU8("<a/>") })),
      "BAD_DOCUMENT",
    );
  });

  it("refuses files over the size limit before reading them", async () => {
    await refused(
      run("big.txt", new Uint8Array(DEFAULT_MAX_EXTRACT_FILE_BYTES + 1)),
      "TOO_LARGE",
    );
    // exactly at the limit is opened
    const ok = await run(
      "edge.txt",
      new Uint8Array(DEFAULT_MAX_EXTRACT_FILE_BYTES),
    );
    expect(ok.segments).toBeDefined();
  });

  it("honours an explicit maxBytes", async () => {
    const input = {
      fileId: "f1",
      name: "a.txt",
      mime: "",
      bytes: new Uint8Array(11),
    };
    await refused(extractFileText({ ...input, maxBytes: 10 }), "TOO_LARGE");
    await extractFileText({ ...input, maxBytes: 11 });
  });

  it("deeply nested XML is refused", async () => {
    const deep = `<w:document xmlns:w="x">${"<w:a>".repeat(400)}`;
    await refused(
      run("d.docx", zipSync({ "word/document.xml": strToU8(deep) })),
      "BAD_DOCUMENT",
    );
  });
});
