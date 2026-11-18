/**
 * "Inputs used in this run" (Review · Assumptions): the form the run pinned in
 * `runs.form_json`, as display rows in form order. Pure, so the results
 * loader and tests share it. A run without a pinned form gives `null`; the
 * live form never stands in for it.
 */
import type { FormFile, Input, Origin } from "../../shared/form";
import { TIER_LABELS, display } from "../components/clarify/draft";
import { LABELS } from "./intake-fields";

export type EnteredInputRow = {
  id: string;
  label: string;
  /** The value with its unit, or "Not sure" — never a substituted 0. */
  value: string;
  notSure: boolean;
  tier: string;
  source: string;
  /** The cited file's name, a note that it is gone, or null. */
  file: string | null;
  basis: string | null;
  note: string | null;
  /** What the run found when it looked the confirmed quote up in its file. */
  quoteCheck: QuoteCheck | null;
};

export type QuoteCheck = "found" | "not_found" | "unreadable";

export const QUOTE_CHECK_LABELS: Record<QuoteCheck, string> = {
  found: "found in file",
  not_found: "not found",
  unreadable: "file unreadable",
};

const ORIGIN_LABELS: Record<Origin, string> = {
  user: "Entered",
  file: "From a file",
  default: "Default",
  proxy_accepted: "Default",
  assistant_accepted: "Assistant, accepted",
  assistant_estimate: "AI estimate",
};

export const FILE_GONE = "File no longer in the project";

function asForm(formJson: unknown): FormFile | null {
  const f = formJson as Partial<FormFile> | null;
  if (!f || typeof f !== "object" || !Array.isArray(f.inputs)) return null;
  return f as FormFile;
}

function valueText(input: Input, currency: string): string {
  const shown = display(input.id, input, currency) ?? "";
  const range =
    typeof input.low === "number" && typeof input.high === "number"
      ? ` (range ${input.low.toLocaleString("en-US")}–${input.high.toLocaleString("en-US")})`
      : "";
  return shown + range;
}

export function enteredInputs(
  formJson: unknown,
  files: readonly { id: string; name: string }[],
  /** The run's `quote_check` results by input id (empty for older runs). */
  checks: Readonly<Record<string, QuoteCheck>> = {},
): EnteredInputRow[] | null {
  const form = asForm(formJson);
  if (!form) return null;
  const names = new Map(files.map((f) => [f.id, f.name]));
  const currency = typeof form.currency === "string" ? form.currency : "";
  return form.inputs
    .filter((input) => input && typeof input.id === "string")
    .map((input) => {
      const notSure = input.tier === "user_unknown" || input.value === null;
      const fileId = input.backing?.source_file_id;
      return {
        id: input.id,
        label: LABELS[input.id] ?? input.id.replaceAll("_", " "),
        value: notSure ? "Not sure" : valueText(input, currency),
        notSure,
        tier: TIER_LABELS[input.tier] ?? input.tier,
        source: ORIGIN_LABELS[input.origin] ?? input.origin,
        file: fileId ? (names.get(fileId) ?? FILE_GONE) : null,
        basis: input.basis ?? null,
        note: input.note?.trim() ? input.note.trim() : null,
        quoteCheck: checks[input.id] ?? null,
      };
    });
}
