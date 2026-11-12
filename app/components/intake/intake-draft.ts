import type { FormFile, Goal, Input } from "../../../shared/form";
import { INPUT_RULES } from "../../lib/intake-catalog";
import { INTAKE_FIELDS } from "../../lib/intake-fields";

/** Envelope fields edited on Clarify that are not `inputs[]` ids. */
const CLARIFY_ENVELOPE = [
  "currency",
  "horizon_years",
  "other_notes",
  "measurement_plan",
];

/** Whether `?input=<id>` names a field that lives on the Clarify step. */
export function isClarifyField(id: string): boolean {
  if ((INTAKE_FIELDS as readonly string[]).includes(id)) return false;
  return Object.hasOwn(INPUT_RULES, id) || CLARIFY_ENVELOPE.includes(id);
}

/**
 * The description uploads in the project description slot carry. It is how
 * the Intake step tells that file apart: the form contract has no role field
 * for files.
 */
export const PROJECT_DESCRIPTION = "Project description";

export type IntakeEdits = {
  projectName: string;
  decision: string;
  goals: Goal[];
};

type FileRow = { id: string; description: string };

function textRecord(
  previous: Input | undefined,
  id: string,
  text: string,
): Input | undefined {
  const value = text.trim();
  if (!value) return undefined;
  if (previous?.value === value) return previous;
  // A changed value is the user's own: an old note or "unknown" no longer fits.
  const next: Input = {
    ...previous,
    id,
    value,
    tier: "estimate",
    origin: "user",
  };
  if (previous && previous.tier !== "user_unknown") next.tier = previous.tier;
  delete next.note;
  return next;
}

/**
 * The saved draft with this step's edits applied. Fields owned by Clarify
 * (numbers, settings, notes, measurement plans) pass through unchanged.
 * `file_descriptions` lists every file in the project: the form's own
 * description where it has one, otherwise the upload description. Entries for
 * files that are not in the project are dropped.
 */
export function applyIntake(
  draft: FormFile,
  edits: IntakeEdits,
  files: readonly FileRow[],
): FormFile {
  const byId = new Map(draft.inputs.map((record) => [record.id, record]));
  const texts: [string, string][] = [
    ["project_name", edits.projectName],
    ["decision_statement", edits.decision],
  ];
  const inputs = draft.inputs.flatMap((record) => {
    const edit = texts.find(([id]) => id === record.id);
    if (!edit) return [record];
    const next = textRecord(record, edit[0], edit[1]);
    return next ? [next] : [];
  });
  for (const [id, text] of texts)
    if (!byId.has(id)) {
      const next = textRecord(undefined, id, text);
      if (next) inputs.push(next);
    }
  const file_descriptions: Record<string, string> = {};
  for (const file of files) {
    const own = draft.file_descriptions[file.id];
    const description = own?.trim() ? own : file.description;
    if (description.trim()) file_descriptions[file.id] = description;
  }
  return { ...draft, goals: edits.goals, inputs, file_descriptions };
}

/** The value of a text input record in the draft, or "". */
export function draftText(draft: FormFile, id: string): string {
  const value = draft.inputs.find((record) => record.id === id)?.value;
  return typeof value === "string" ? value : "";
}
