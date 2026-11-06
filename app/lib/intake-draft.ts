import type { FormContext, FormFile, FormIssue } from "../../shared/form";
import { validateFormFile } from "./intake-form.ts";

/** Drafts use the form envelope, with an explicit marker when not engine-ready.
 * Empty goals and horizon 0 mean unanswered, never an engine default.
 * Ready saves omit the marker and are exact producer output.
 */
export type IntakeDraft = FormFile & { intake_draft_version?: 1 };

export function blankIntake(goals: FormFile["goals"] = []): FormFile {
  return {
    version: 1,
    goals: goals.filter((goal) =>
      [
        "time_savings",
        "data_quality",
        "decision_speed",
        "risk_reduction",
      ].includes(goal),
    ),
    currency: "USD",
    horizon_years: 0,
    inputs: [],
    file_descriptions: {},
    other_notes: "",
    measurement_plan: {},
    asked: [],
  };
}

export function validateIntakeDraft(
  value: unknown,
  context: FormContext,
): FormIssue[] {
  const form = value as Partial<IntakeDraft> | null;
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
    "intake_draft_version",
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
  return validateFormFile(value, context)
    .filter((issue) => {
      if (
        issue.code === "GOALS" &&
        Array.isArray(form?.goals) &&
        !form.goals.length
      )
        return false;
      if (issue.code === "HORIZON" && form?.horizon_years === 0) return false;
      if (["ESSENTIAL_COST", "MISSING_SETTING"].includes(issue.code))
        return false;
      if (issue.code === "MEASURED_TYPED") return false;
      if (issue.code === "ADOPTION_LENGTH" && form?.horizon_years === 0)
        return false;
      return true;
    })
    .concat(
      form?.intake_draft_version !== undefined &&
        form.intake_draft_version !== 1
        ? [
            {
              code: "VERSION",
              field: "$",
              message: "Unsupported intake draft version.",
            },
          ]
        : [],
    );
}

/** Never silently discard an unsupported or malformed saved form. */
export function hydrateIntake(
  value: unknown,
  context: FormContext,
): FormFile | null {
  if (validateIntakeDraft(value, context).length) return null;
  return value as FormFile;
}

export function intakePaths(form: FormFile, target?: string | null) {
  const ids = new Set(form.inputs.map((input) => input.id));
  if (target) ids.add(target);
  return {
    time:
      ids.has("minutes_per_task_before") ||
      ids.has("minutes_per_task_after") ||
      ids.has("tasks_per_staff_week")
        ? "tasks"
        : "hours",
    quality:
      ids.has("error_rate_before") ||
      ids.has("error_rate_after") ||
      ids.has("records_or_events_per_year")
        ? "rates"
        : "counts",
    errorCost:
      ids.has("cost_per_clean_unit") || ids.has("error_cost_multiplier")
        ? "derived"
        : "direct",
    risk:
      ids.has("asset_value") || ids.has("exposure_factor_pct")
        ? "asset"
        : "direct",
  };
}
