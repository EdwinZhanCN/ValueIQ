// A small push XML parser for OOXML parts. Safe by construction:
//  - any DOCTYPE or ENTITY declaration is refused, so there are no external or recursive entities;
//    only the five predefined entities and numeric character references are decoded, anything else
//    stays literal text;
//  - it is incremental: the caller writes decoded chunks and only an unfinished tag or text node is
//    kept, never the whole part, so a large worksheet is read in bounded memory;
//  - nesting depth and the size of an unfinished token are capped.
import { MAX_XML_CARRY } from "../limits";
import { ExtractError } from "./types";

export interface SaxHandlers {
  open(name: string, attrs: Record<string, string>): void;
  close(name: string): void;
  text(s: string): void;
}

const MAX_DEPTH = 256;
const ENT: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(
    /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,4});/g,
    (m, g: string) => {
      if (g.startsWith("#")) {
        const cp =
          g[1] === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        if (
          !Number.isFinite(cp) ||
          cp > 0x10ffff ||
          (cp >= 0xd800 && cp <= 0xdfff) ||
          (cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13)
        )
          return "�";
        return String.fromCodePoint(cp);
      }
      return ENT[g] ?? m;
    },
  );
}

/** The name without its namespace prefix: "w:p" -> "p". */
export function localName(n: string): string {
  const i = n.indexOf(":");
  return i < 0 ? n : n.slice(i + 1);
}

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const CDATA_OPEN = "<![CDATA[";

export class SaxParser {
  private buf = "";
  private depth = 0;
  private stopped = false;
  constructor(private readonly h: SaxHandlers) {}

  /** Ignore the rest of the input (for example once a row cap is reached). */
  stop(): void {
    this.stopped = true;
    this.buf = "";
  }
  get isStopped(): boolean {
    return this.stopped;
  }

  write(chunk: string): void {
    if (this.stopped) return;
    this.buf += chunk;
    this.drain(false);
  }

  end(): void {
    if (this.stopped) return;
    this.drain(true);
    this.buf = "";
  }

  private drain(final: boolean): void {
    const b = this.buf;
    let pos = 0;
    for (;;) {
      if (this.stopped) return;
      const lt = b.indexOf("<", pos);
      if (lt < 0) {
        // text only: keep a possibly split entity ("&am") for the next chunk
        let end = b.length;
        if (!final) {
          const amp = b.lastIndexOf("&");
          if (amp >= pos && b.length - amp < 12 && !b.includes(";", amp))
            end = amp;
        }
        if (end > pos) this.h.text(decodeEntities(b.slice(pos, end)));
        pos = end;
        break;
      }
      if (lt > pos) this.h.text(decodeEntities(b.slice(pos, lt)));
      pos = lt;
      if (b.startsWith("<!--", lt)) {
        const e = b.indexOf("-->", lt + 4);
        if (e < 0) break;
        pos = e + 3;
        continue;
      }
      if (b.startsWith(CDATA_OPEN, lt)) {
        const e = b.indexOf("]]>", lt + 9);
        if (e < 0) break;
        this.h.text(b.slice(lt + 9, e));
        pos = e + 3;
        continue;
      }
      if (b.startsWith("<?", lt)) {
        const e = b.indexOf("?>", lt + 2);
        if (e < 0) break;
        pos = e + 2;
        continue;
      }
      if (b.startsWith("<!", lt)) {
        // <!DOCTYPE, <!ENTITY, <!ELEMENT ...: never legitimate in OOXML parts. A short tail that
        // could still become a comment or CDATA opener waits for more input.
        const head = b.slice(lt, lt + 9);
        if (
          !final &&
          b.length - lt < 9 &&
          (CDATA_OPEN.startsWith(head) || "<!--".startsWith(head))
        )
          break;
        throw new ExtractError(
          "UNSAFE_XML",
          "The document contains a DOCTYPE or entity declaration, which is refused",
        );
      }
      // an element tag: find the closing '>' outside quotes
      let e = lt + 1;
      let q = "";
      let found = -1;
      for (; e < b.length; e++) {
        const c = b[e];
        if (q) {
          if (c === q) q = "";
        } else if (c === '"' || c === "'") q = c;
        else if (c === ">") {
          found = e;
          break;
        }
      }
      if (found < 0) break;
      this.tag(b.slice(lt + 1, found));
      pos = found + 1;
    }
    this.buf = b.slice(pos);
    if (this.buf.length > MAX_XML_CARRY)
      throw new ExtractError(
        "BAD_DOCUMENT",
        "An XML token is too large to read safely",
      );
    if (final && this.buf.trim() !== "")
      throw new ExtractError("BAD_DOCUMENT", "The XML ended inside a tag");
  }

  private tag(inner: string): void {
    if (inner.startsWith("/")) {
      this.depth = Math.max(0, this.depth - 1);
      this.h.close(inner.slice(1).trim());
      return;
    }
    const selfClose = inner.endsWith("/");
    const body = selfClose ? inner.slice(0, -1) : inner;
    const m = /^([^\s/]+)/.exec(body);
    if (!m) throw new ExtractError("BAD_DOCUMENT", "Malformed XML tag");
    const name = m[1] as string;
    const attrs: Record<string, string> = {};
    if (body.length > name.length) {
      ATTR.lastIndex = name.length;
      let a: RegExpExecArray | null;
      while ((a = ATTR.exec(body)) !== null)
        attrs[a[1] as string] = decodeEntities(a[2] ?? a[3] ?? "");
    }
    if (++this.depth > MAX_DEPTH)
      throw new ExtractError("BAD_DOCUMENT", "The XML is nested too deeply");
    this.h.open(name, attrs);
    if (selfClose) {
      this.depth--;
      this.h.close(name);
    }
  }
}
