import type { FormContext, FormFile, FormIssue } from "../../shared/form";
import { validateFormFile } from "./intake-form.ts";

/** Drafts use the canonical version-1 envelope with incomplete fields.
 * Strict validation remains the Start run/export boundary.
 */
export function validateIntakeDraft(
  value: unknown,
  context: FormContext,
): FormIssue[] {
  const form = value as Partial<FormFile> | null;
  const allowed = new Set([
    "version",
    "goals",
    "currency",
    "horizon_years",
    "inputs",
    "file_descriptions",
    "other_notes",
    "measurement_plan",
    "asked",
  ]);
  if (
    form &&
    typeof form === "object" &&
    Object.keys(form).some((key) => !allowed.has(key))
  )
    return [
      {
        code: "SHAPE",
        field: "$",
        message:
          "Unsupported form properties; original JSON must be preserved.",
      },
    ];
  return validateFormFile(value, context).filter((issue) => {
    if (
      issue.code === "GOALS" &&
      Array.isArray(form?.goals) &&
      !form.goals.length
    )
      return false;
    if (issue.code === "HORIZON" && form?.horizon_years === 0) return false;
    if (["ESSENTIAL_COST", "MISSING_SETTING"].includes(issue.code))
      return false;
    if (
      issue.code === "BASIS" &&
      form?.inputs?.find((input) => input.id === issue.field)?.basis ===
        undefined
    )
      return false;
    if (issue.code === "MEASURED_TYPED") return false;
    if (issue.code === "ADOPTION_LENGTH" && form?.horizon_years === 0)
      return false;
    return true;
  });
}
