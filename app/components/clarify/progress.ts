import { DEFAULTS, LABELS } from "../../lib/intake-fields";
import { answered, display, OPTIONAL, type Section } from "./draft";
import type { FormDraft } from "./use-form-draft";

/** Envelope settings the Clarify step edits beside the input records. */
export const SETTINGS = ["currency", "horizon_years"] as const;

export type Group = Section & {
  /** Every field the card shows, settings included. */
  fields: string[];
  /** Required fields still without a value or an explicit "not sure". */
  gaps: string[];
  complete: boolean;
};

const horizonOk = (text: string) => {
  const value = Number(text);
  return !!text.trim() && Number.isInteger(value) && value >= 1 && value <= 20;
};

export function isAnswered(draft: FormDraft, id: string) {
  if (id === "currency") return /^[A-Z]{3}$/.test(draft.currency);
  if (id === "horizon_years") return horizonOk(draft.horizon);
  return answered(draft.byId.get(id));
}

/** A field's value for lists, or null when nothing is entered. */
export function valueOf(draft: FormDraft, id: string): string | null {
  if (id === "currency") return draft.currency || null;
  if (id === "horizon_years")
    return draft.horizon ? `${draft.horizon} years` : null;
  return display(id, draft.byId.get(id), draft.currency);
}

export const labelOf = (id: string) => LABELS[id] ?? id;

/** The Clarify question groups for the draft's goals, in asking order. */
export function groupsOf(draft: FormDraft): Group[] {
  return draft.sections
    .filter((section) => section.key !== "context")
    .map((section) => {
      const fields =
        section.key === "settings"
          ? [...SETTINGS, ...section.ids]
          : section.ids;
      const gaps = fields.filter(
        (id) => !OPTIONAL.has(id) && !isAnswered(draft, id),
      );
      const invalid = draft.issues.some((issue) =>
        fields.includes(issue.field),
      );
      return { ...section, fields, gaps, complete: !gaps.length && !invalid };
    });
}

/** Fields with an industry default or proxy that the goals ask for. */
export const defaultFields = (draft: FormDraft) =>
  [...draft.visible].filter((id) => DEFAULTS[id]);
