import { LABELS as INPUT_LABELS } from "./intake-fields";

const UNSPECIFIED = "not specified";

function withCase(source: string, replacement: string) {
  return /^[A-Z]/.test(source)
    ? replacement.replace(/^./, (character) => character.toUpperCase())
    : replacement;
}

/** Translate engine terminology for display without changing stored output. */
export function plainLanguage(value: string) {
  return value
    .replace(/weakest links?/gi, (match) =>
      withCase(
        match,
        match.toLowerCase().endsWith("s")
          ? "least-supported inputs"
          : "least-supported input",
      ),
    )
    .replace(/evidence haircuts/gi, (match) =>
      withCase(match, "evidence discounts"),
    )
    .replace(/evidence haircut/gi, (match) =>
      withCase(match, "evidence discount"),
    )
    .replace(/haircuts/gi, (match) => withCase(match, "evidence discounts"))
    .replace(/haircut/gi, (match) => withCase(match, "evidence discount"))
    .replace(/recapture_pct/gi, "freed time used productively")
    .replace(/\brecapture\b/gi, "productive use of freed time")
    .replace(/\bfloors\b/gi, "minimum confidence levels we require")
    .replace(/\bfloor\b/gi, "minimum confidence we require")
    .replace(/\btiers\b/gi, "evidence levels")
    .replace(/\btier\b/gi, "evidence level");
}

export function inputLabel(id: string) {
  return (
    INPUT_LABELS[id] ??
    id
      .replaceAll("_pct", " percentage")
      .replaceAll("_", " ")
      .replace(/^./, (character) => character.toUpperCase())
  );
}

export function isSpecified(value: string) {
  return !value.trim().toLowerCase().startsWith(UNSPECIFIED);
}

export function paybackHeadline(text: string) {
  const concise = text.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return concise.replace(/^./, (character) => character.toUpperCase());
}

export function isNotCountedInHard(labelClass: string) {
  return labelClass === "capacity_value" || labelClass === "avoided_loss";
}

export function confidenceSummary(
  value: number,
  counts: Record<string, number>,
) {
  const percent = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
  const evidence = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${level}`)
    .join(", ");
  return `Confidence ${percent}, based on ${evidence || "the documented evidence"} inputs.`;
}
