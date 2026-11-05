import type { FormContext, FormFile, FormIssue } from "../../shared/form";
import { INPUT_RULES } from "./intake-catalog.ts";

const goals = [
  "time_savings",
  "data_quality",
  "decision_speed",
  "risk_reduction",
];
const tiers = [
  "measured",
  "documented",
  "benchmark",
  "estimate",
  "assumption",
  "user_unknown",
];
const origins = [
  "user",
  "file",
  "default",
  "proxy_accepted",
  "assistant_accepted",
];
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item: unknown) => typeof item === "string");

/** Independent form validation. Does not import the engine or compute a gate.
 * Context must come from an authorized file listing, never from JSON itself.
 */
export function validateFormFile(
  candidate: unknown,
  context: FormContext,
): FormIssue[] {
  const issues: FormIssue[] = [];
  const add = (code: string, field: string, message: string) =>
    issues.push({ code, field, message });
  if (!object(candidate))
    return [{ code: "SHAPE", field: "$", message: "Expected a form object." }];
  if (candidate.version !== 1)
    add("VERSION", "version", "Expected form version 1.");
  if (
    !strings(candidate.goals) ||
    !candidate.goals.length ||
    candidate.goals.some((goal) => !goals.includes(goal)) ||
    new Set(candidate.goals).size !== candidate.goals.length
  )
    add("GOALS", "goals", "Choose distinct supported goals.");
  if (
    typeof candidate.currency !== "string" ||
    !/^[A-Z]{3}$/.test(candidate.currency)
  )
    add("CURRENCY", "currency", "Expected a three-letter currency code.");
  const horizon = candidate.horizon_years;
  if (
    !finite(horizon) ||
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 20
  )
    add("HORIZON", "horizon_years", "Use an integer from 1 to 20.");
  if (
    !finite(candidate.discount_rate_pct) ||
    candidate.discount_rate_pct < 0 ||
    candidate.discount_rate_pct > 100
  )
    add("BOUNDS", "discount_rate_pct", "Use a percentage from 0 to 100.");
  if (
    !object(candidate.file_descriptions) ||
    Object.values(candidate.file_descriptions).some(
      (description) => typeof description !== "string" || !description.trim(),
    )
  )
    add("SHAPE", "file_descriptions", "Expected non-empty file descriptions.");
  const ownFiles = new Set(
    context.files
      .filter((file) => file.projectId === context.projectId)
      .map((file) => file.id),
  );
  if (object(candidate.file_descriptions))
    for (const id of Object.keys(candidate.file_descriptions))
      if (!ownFiles.has(id))
        add(
          "FOREIGN_FILE",
          "file_descriptions",
          `File ${id} is not in this project.`,
        );
  if (typeof candidate.other_notes !== "string")
    add("SHAPE", "other_notes", "Expected text.");
  if (!strings(candidate.asked))
    add("SHAPE", "asked", "Expected question IDs.");
  if (!object(candidate.measurement_plan))
    add("SHAPE", "measurement_plan", "Expected a measurement plan object.");
  else
    for (const [goal, entry] of Object.entries(candidate.measurement_plan)) {
      if (
        !goals.includes(goal) ||
        !object(entry) ||
        ["metric", "baseline", "baseline_source", "owner", "frequency"].some(
          (key) => typeof entry[key] !== "string",
        )
      )
        add(
          "SHAPE",
          `measurement_plan.${goal}`,
          "Expected a supported goal and text measurement fields.",
        );
    }
  if (!Array.isArray(candidate.inputs)) {
    add("SHAPE", "inputs", "Expected input records.");
    return issues;
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of candidate.inputs as unknown[]) {
    if (!object(raw) || typeof raw.id !== "string") {
      add("SHAPE", "inputs", "Each input needs an ID.");
      continue;
    }
    const id = raw.id;
    if (byId.has(id)) add("DUPLICATE", id, "An input ID may appear only once.");
    byId.set(id, raw);
    const rule = Object.hasOwn(INPUT_RULES, id) ? INPUT_RULES[id] : undefined;
    if (!rule) {
      add("UNKNOWN_ID", id, "Unknown field ID.");
      continue;
    }
    if (typeof raw.tier !== "string" || !tiers.includes(raw.tier))
      add("TIER", id, "Unknown evidence tier.");
    if (typeof raw.origin !== "string" || !origins.includes(raw.origin))
      add("ORIGIN", id, "Unknown origin.");
    if (typeof raw.unit !== "string" || !raw.unit.trim())
      add("UNIT", id, "A unit is required.");
    if (
      raw.period !== undefined &&
      (typeof raw.period !== "string" ||
        !["per_year", "per_week", "per_event", "one_time"].includes(raw.period))
    )
      add("PERIOD", id, "Unknown period.");
    if (raw.note !== undefined && typeof raw.note !== "string")
      add("SHAPE", id, "A note must be text.");
    if (
      raw.vendor_supplied !== undefined &&
      typeof raw.vendor_supplied !== "boolean"
    )
      add("SHAPE", id, "vendor_supplied must be boolean.");
    if (
      raw.basis !== undefined &&
      (typeof raw.basis !== "string" ||
        !["quoted", "estimated", "assumed"].includes(raw.basis) ||
        rule.role !== "cost")
    )
      add("BASIS", id, "Only cost inputs can carry a recognized cost basis.");
    if (
      rule.role === "cost" &&
      id !== "cost_uplift_pct" &&
      raw.value !== null &&
      raw.basis === undefined
    )
      add("BASIS", id, "Specify the cost basis explicitly.");
    const backing = raw.backing;
    if (backing !== undefined) {
      if (!object(backing) || rule.role !== "effect")
        add("BACKING", id, "Only effect inputs carry structured backing.");
      else {
        for (const key of [
          "source_file_id",
          "quote",
          "second_source_note",
          "source_date",
          "verified_by",
        ])
          if (backing[key] !== undefined && typeof backing[key] !== "string")
            add("BACKING", id, `${key} must be text.`);
        for (const key of ["quote_confirmed", "verified"])
          if (backing[key] !== undefined && typeof backing[key] !== "boolean")
            add("BACKING", id, `${key} must be boolean.`);
        for (const key of [
          "second_source_value",
          "observations",
          "period_months",
        ])
          if (
            backing[key] !== undefined &&
            (!finite(backing[key]) || backing[key] < 0)
          )
            add("BACKING", id, `${key} must be a non-negative finite number.`);
        if (
          backing.observations !== undefined &&
          !Number.isInteger(backing.observations)
        )
          add("BACKING", id, "observations must be an integer.");
        if (
          backing.source_date !== undefined &&
          (typeof backing.source_date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(backing.source_date) ||
            !Number.isFinite(Date.parse(backing.source_date)) ||
            new Date(backing.source_date).toISOString().slice(0, 10) !==
              backing.source_date)
        )
          add("BACKING", id, "source_date must be a real ISO date.");
        if (
          backing.source_file_id !== undefined &&
          (typeof backing.source_file_id !== "string" ||
            !ownFiles.has(backing.source_file_id) ||
            !object(candidate.file_descriptions) ||
            !Object.hasOwn(candidate.file_descriptions, backing.source_file_id))
        )
          add(
            "FOREIGN_FILE",
            id,
            "Source file must belong to this project and have a description.",
          );
      }
    }
    if (
      raw.tier === "measured" &&
      rule.role === "effect" &&
      (!object(backing) ||
        typeof backing.source_file_id !== "string" ||
        !backing.quote_confirmed ||
        typeof backing.quote !== "string" ||
        !backing.quote.trim() ||
        raw.origin !== "file")
    )
      add(
        "MEASURED_TYPED",
        id,
        "Measured values require file origin, a source file and a confirmed quote; typed time savings cannot be measured.",
      );
    for (const key of ["low", "high"] as const)
      if (raw[key] !== undefined && !finite(raw[key]))
        add("RANGE", id, "Ranges must be finite.");
    const value = raw.value;
    if (value === null) continue; // Unknown effects become unquantified; costs checked below.
    const inRange = (number: number) => {
      if (
        (rule.min !== undefined &&
          (rule.exclusiveMin ? number <= rule.min : number < rule.min)) ||
        (rule.max !== undefined && number > rule.max)
      )
        add("BOUNDS", id, "Value is outside the permitted range.");
    };
    switch (rule.kind) {
      case "number":
      case "integer":
        if (!finite(value)) add("TYPE", id, "Expected a finite number.");
        else {
          inRange(value);
          if (rule.kind === "integer" && !Number.isInteger(value))
            add("INTEGER", id, "Expected a whole number.");
        }
        break;
      case "numbers":
        if (!Array.isArray(value) || !value.every(finite))
          add("TYPE", id, "Expected a list of finite numbers.");
        else {
          value.forEach(inRange);
          if (id === "adoption_by_year" && value.length !== horizon)
            add(
              "ADOPTION_LENGTH",
              id,
              "Provide one adoption value per horizon year.",
            );
        }
        break;
      case "strings":
        if (
          !strings(value) ||
          (rule.options && value.some((item) => !rule.options?.includes(item)))
        )
          add("TYPE", id, "Expected recognized text options.");
        break;
      case "enum":
        if (typeof value !== "string" || !rule.options?.includes(value))
          add("ENUM", id, "Choose a recognized option.");
        break;
      case "text":
        if (typeof value !== "string") add("TYPE", id, "Expected text.");
        break;
    }
    if (
      id === "project_name" &&
      (typeof value !== "string" || !value.trim() || value.length > 120)
    )
      add("BOUNDS", id, "Project name must have 1-120 characters.");
    if (
      id === "decision_statement" &&
      (typeof value !== "string" || !value.trim() || value.length > 500)
    )
      add("BOUNDS", id, "Decision statement must have 1-500 characters.");
    for (const key of ["low", "high"] as const)
      if (
        finite(raw[key]) &&
        finite(value) &&
        (key === "low" ? raw[key] > value : raw[key] < value)
      )
        add("RANGE", id, "Ranges must contain the value.");
  }
  for (const [before, after, strict] of [
    ["minutes_per_task_before", "minutes_per_task_after", true],
    ["days_to_decide_before", "days_to_decide_after", true],
    ["error_rate_before", "error_rate_after", false],
    ["error_count_before", "error_count_after", false],
    ["aro_before", "aro_after", false],
  ] as const) {
    const b = byId.get(before)?.value;
    const a = byId.get(after)?.value;
    if (finite(b) && finite(a) && (strict ? a >= b : a > b))
      add(
        "AFTER_BEFORE",
        after,
        `After must be ${strict ? "less than" : "no greater than"} before.`,
      );
  }
  for (const id of ["cost_one_time_vendor_license", "cost_annual_run"])
    if (
      !byId.has(id) ||
      byId.get(id)?.value === null ||
      byId.get(id)?.tier === "user_unknown"
    )
      add("ESSENTIAL_COST", id, "Essential cost is missing or unknown.");
  for (const id of ["currency", "horizon_years", "discount_rate_pct"])
    if (byId.has(id) && byId.get(id)?.value !== candidate[id])
      add(
        "SETTING_MISMATCH",
        id,
        "Setting metadata must agree with the envelope value.",
      );
  return issues;
}

export class FormValidationError extends Error {
  readonly issues: FormIssue[];
  /** Test handoff only: the exact rejected candidate, never a validated form. */
  readonly rejectedJson: string;
  constructor(issues: FormIssue[], rejectedJson: string) {
    super(issues.map((issue) => `${issue.field}: ${issue.message}`).join("\n"));
    this.name = "FormValidationError";
    this.issues = issues;
    this.rejectedJson = rejectedJson;
  }
}

function encode(candidate: unknown): string {
  const json = JSON.stringify(
    candidate,
    (_key, value: unknown) => {
      if (
        value === undefined ||
        typeof value === "function" ||
        typeof value === "symbol" ||
        (typeof value === "number" && !Number.isFinite(value))
      )
        throw new TypeError(
          "Form values must be JSON-safe; unknown is null, never undefined or NaN.",
        );
      return value;
    },
    2,
  );
  if (json === undefined) throw new TypeError("Expected a form object.");
  return `${json}\n`;
}

/** The form's reusable export path; never normalizes, clamps or invents values. */
export function serializeFormFile(
  candidate: unknown,
  context: FormContext,
): string {
  const json = encode(candidate);
  const issues = validateFormFile(candidate, context);
  if (issues.length) throw new FormValidationError(issues, json);
  return json;
}

export function parseFormFile(json: string, context: FormContext): FormFile {
  const candidate: unknown = JSON.parse(json);
  serializeFormFile(candidate, context);
  // All required fields and input record shapes have been checked above.
  return candidate as FormFile;
}

/** Reject edits without replacing the last accepted form state. */
export function applyFormEdit(
  previous: FormFile,
  candidate: unknown,
  context: FormContext,
): { form: FormFile; issues: FormIssue[] } {
  try {
    return {
      form: parseFormFile(serializeFormFile(candidate, context), context),
      issues: [],
    };
  } catch (error) {
    if (error instanceof FormValidationError)
      return { form: previous, issues: error.issues };
    throw error;
  }
}
