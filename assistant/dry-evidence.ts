// Scripted stand-in for the cheap evidence model, for local `VALUEIQ_MODEL=dry` only. No network,
// no key. It reads the file data in the prompt and proposes every passage that names the requested
// input (by its hint words) and holds a number. find_evidence then checks each proposal against the
// file exactly as it does for the real model, so nothing here can put a quote in the form.
import type { StructuredCompleter } from "./evidence/host";
import { specFor } from "./evidence/find";

const LINE = /^\[([^\]|]+)(?: \| [^\]]*)?\] (.*)$/;

export function dryEvidenceCompleter(): StructuredCompleter {
  return (req) => {
    const id = /\(id ([a-z0-9_]+)\)/.exec(req.prompt)?.[1] ?? "";
    const hints = specFor(id)?.hints ?? [];
    // The data sits between the marker lines (the instructions also name them).
    const nonce = /^BEGIN-FILE-DATA-([0-9a-f]+)$/m.exec(req.prompt)?.[1];
    const start = nonce
      ? req.prompt.indexOf(`\nBEGIN-FILE-DATA-${nonce}\n`)
      : -1;
    const end = nonce ? req.prompt.lastIndexOf(`\nEND-FILE-DATA-${nonce}`) : -1;
    const body = start >= 0 && end > start ? req.prompt.slice(start, end) : "";
    const candidates = [];
    for (const line of body.split("\n")) {
      const m = LINE.exec(line.trim());
      if (!m || m[1]!.startsWith("columns of ")) continue;
      const [, location, text] = m as unknown as [string, string, string];
      const lower = text.toLowerCase();
      // A hint counts when all its words are in the passage, in any order.
      const words = new Set(lower.split(/[^a-z0-9%]+/));
      const hits = hints.filter((h) =>
        h.split(" ").every((w) => words.has(w) || lower.includes(w)),
      ).length;
      const value = /\d[\d,]*(?:\.\d+)?%?/.exec(text)?.[0];
      if (hits < 2 || !value || text.length > 300) continue;
      candidates.push({
        quote: text,
        location: location.trim(),
        value_in_quote: value,
      });
      if (candidates.length >= 8) break;
    }
    return Promise.resolve({
      value: { candidates },
      usage: { prompt: 0, output: 0, thoughts: 0, total: 0 },
      model: "scripted-local",
    });
  };
}
