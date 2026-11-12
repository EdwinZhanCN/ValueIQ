// A minimal, defensive ZIP reader for OOXML packages (DOCX, XLSX). The central directory is parsed
// here; fflate's streaming Inflate does the decompression in small steps so the output size is
// checked every few kilobytes of input. Refused: encryption, ZIP64, duplicate names, entries whose
// declared size or ratio is absurd, and entries that expand past what they declared.
import { Inflate } from "fflate";
import {
  INFLATE_CHUNK,
  MAX_PART_BYTES,
  MAX_TOTAL_PART_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_RATIO,
} from "../limits";
import { ExtractError } from "./types";

export interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  size: number;
  offset: number;
}

const u16 = (d: Uint8Array, o: number) =>
  (d[o] as number) | ((d[o + 1] as number) << 8);
const u32 = (d: Uint8Array, o: number) =>
  ((d[o] as number) |
    ((d[o + 1] as number) << 8) |
    ((d[o + 2] as number) << 16) |
    ((d[o + 3] as number) << 24)) >>>
  0;

export function readZipDirectory(data: Uint8Array): Map<string, ZipEntry> {
  const bad = (m: string) => new ExtractError("BAD_ARCHIVE", m);
  if (data.length < 22) throw bad("Not a zip package");
  let eocd = -1;
  for (
    let i = data.length - 22;
    i >= Math.max(0, data.length - 22 - 65535);
    i--
  )
    if (u32(data, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw bad("Not a zip package");
  const total = u16(data, eocd + 10);
  const cdSize = u32(data, eocd + 12);
  const cdOffset = u32(data, eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    throw bad("ZIP64 packages are not supported");
  if (total > MAX_ZIP_ENTRIES)
    throw new ExtractError("ZIP_BOMB", "The package has too many parts");
  if (cdOffset + cdSize > data.length)
    throw bad("The zip directory is out of range");
  const dec = new TextDecoder("utf-8");
  const out = new Map<string, ZipEntry>();
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > data.length || u32(data, p) !== 0x02014b50)
      throw bad("Corrupt zip directory");
    const flags = u16(data, p + 8);
    const method = u16(data, p + 10);
    const compSize = u32(data, p + 20);
    const size = u32(data, p + 24);
    const nameLen = u16(data, p + 28);
    const extraLen = u16(data, p + 30);
    const commentLen = u16(data, p + 32);
    const offset = u32(data, p + 42);
    if (p + 46 + nameLen > data.length) throw bad("Corrupt zip directory");
    const name = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (compSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff)
      throw bad("ZIP64 packages are not supported");
    if (name.endsWith("/")) continue; // directory
    if (out.has(name)) throw bad("The package lists the same part twice");
    if (flags & 1) throw bad("Encrypted packages are not supported");
    out.set(name, { name, method, compSize, size, offset });
  }
  return out;
}

/** Shared across all parts of one archive. */
export class ZipBudget {
  total = 0;
}

/**
 * Stream one entry's bytes to `onChunk`. `onChunk` returns false to stop early. Throws ZIP_BOMB when
 * the entry or the archive exceeds its limits, or when the entry expands past its declared size.
 */
export function streamEntry(
  data: Uint8Array,
  e: ZipEntry,
  budget: ZipBudget,
  onChunk: (c: Uint8Array) => boolean | void,
): void {
  if (e.size > MAX_PART_BYTES)
    throw new ExtractError(
      "ZIP_BOMB",
      `The part ${e.name} is too large to read`,
    );
  if (e.size > 1024 * 1024 && e.size / Math.max(1, e.compSize) > MAX_ZIP_RATIO)
    throw new ExtractError(
      "ZIP_BOMB",
      `The part ${e.name} has an implausible compression ratio`,
    );
  if (e.offset + 30 > data.length || u32(data, e.offset) !== 0x04034b50)
    throw new ExtractError("BAD_ARCHIVE", "Corrupt zip entry header");
  const start =
    e.offset + 30 + u16(data, e.offset + 26) + u16(data, e.offset + 28);
  if (start + e.compSize > data.length)
    throw new ExtractError(
      "BAD_ARCHIVE",
      "Zip entry runs past the end of the file",
    );
  const comp = data.subarray(start, start + e.compSize);

  let produced = 0;
  let stopped = false;
  const sink = (c: Uint8Array) => {
    produced += c.length;
    budget.total += c.length;
    if (produced > e.size)
      throw new ExtractError(
        "ZIP_BOMB",
        `The part ${e.name} expands past its declared size`,
      );
    if (budget.total > MAX_TOTAL_PART_BYTES)
      throw new ExtractError(
        "ZIP_BOMB",
        "The package expands to too much data",
      );
    if (onChunk(c) === false) stopped = true;
  };

  if (e.method === 0) {
    for (let i = 0; i < comp.length && !stopped; i += INFLATE_CHUNK)
      sink(comp.subarray(i, i + INFLATE_CHUNK));
    return;
  }
  if (e.method !== 8)
    throw new ExtractError(
      "BAD_ARCHIVE",
      `Unsupported compression method ${e.method}`,
    );
  const inf = new Inflate();
  inf.ondata = (chunk) => sink(chunk);
  try {
    for (let i = 0; i < comp.length && !stopped; i += INFLATE_CHUNK)
      inf.push(
        comp.subarray(i, i + INFLATE_CHUNK),
        i + INFLATE_CHUNK >= comp.length,
      );
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError("BAD_ARCHIVE", `Cannot decompress ${e.name}`);
  }
}

/** Decode an entry as UTF-8 text, feeding `onText` decoded chunks (return false to stop). */
export function streamText(
  data: Uint8Array,
  e: ZipEntry,
  budget: ZipBudget,
  onText: (s: string) => boolean | void,
): void {
  const dec = new TextDecoder("utf-8");
  let stop = false;
  streamEntry(data, e, budget, (c) => {
    if (onText(dec.decode(c, { stream: true })) === false) stop = true;
    return stop ? false : undefined;
  });
  if (!stop) {
    const tail = dec.decode();
    if (tail) onText(tail);
  }
}

/** Small parts (rels, styles, workbook) are read whole, with a tighter cap. */
export function readSmallText(
  data: Uint8Array,
  e: ZipEntry,
  budget: ZipBudget,
  maxBytes = 4 * 1024 * 1024,
): string {
  if (e.size > maxBytes)
    throw new ExtractError(
      "ZIP_BOMB",
      `The part ${e.name} is unexpectedly large`,
    );
  let s = "";
  streamText(data, e, budget, (t) => {
    s += t;
  });
  return s;
}
