/**
 * Pure form-draft logic shared by the Clarify step and the older all-in-one
 * intake form: which fields a goal asks for, how typed text becomes an
 * `Input` record, and how values are shown. No React here.
 */
import type { FormFile, Goal, Input, Tier } from "../../../shared/form";
import { INPUT_RULES } from "../../lib/intake-catalog";
import { DEFAULTS, GOAL_LABELS } from "../../lib/intake-fields";

export type Paths = {
  time: "hours" | "tasks";
  quality: "counts" | "rates";
  errorCost: "direct" | "derived";
  risk: "direct" | "asset";
};

export type SectionKey =
  "context" | "settings" | "costs" | Goal | "classification";

export type Section = {
  key: SectionKey;
  /** Short name, used in lists. */
  title: string;
  /** The question a Clarify card asks. */
  question: string;
  ids: string[];
};

/** Which input method a saved draft used, from the ids it holds. */
export function pathsOf(form: FormFile): Paths {
  const has = (...ids: string[]) =>
    form.inputs.some((record) => ids.includes(record.id));
  return {
    time:
      has("minutes_per_task_before", "minutes_per_task_after") &&
      !has("hours_saved_per_staff_week")
        ? "tasks"
        : "hours",
    quality: has("records_or_events_per_year", "error_rate_before")
      ? "rates"
      : "counts",
    errorCost: has("cost_per_clean_unit") ? "derived" : "direct",
    risk: has("asset_value", "exposure_factor_pct") ? "asset" : "direct",
  };
}

/** The input groups for a set of goals and input methods, in form order. */
export function sectionsFor(goals: readonly Goal[], paths: Paths): Section[] {
  const sections: Section[] = [
    {
      key: "context",
      title: "Project context",
      question: "What is the decision?",
      ids: ["project_name", "decision_statement"],
    },
    {
      key: "settings",
      title: "Financial settings",
      question: "Over what period?",
      ids: ["discount_rate_pct", "adoption_by_year"],
    },
  ];
  if (goals.includes("time_savings"))
    sections.push({
      key: "time_savings",
      title: GOAL_LABELS.time_savings,
      question: "How much time will it save?",
      ids: [
        "staff_affected",
        ...(paths.time === "hours"
          ? ["hours_saved_per_staff_week"]
          : [
              "minutes_per_task_before",
              "minutes_per_task_after",
              "tasks_per_staff_week",
            ]),
        "weeks_per_year",
        "loaded_hourly_cost",
        "recapture_pct",
        "realized_as_cash",
      ],
    });
  if (goals.includes("data_quality"))
    sections.push({
      key: "data_quality",
      title: GOAL_LABELS.data_quality,
      question: "How many errors will it avoid?",
      ids: [
        ...(paths.quality === "counts"
          ? ["error_count_before", "error_count_after"]
          : [
              "records_or_events_per_year",
              "error_rate_before",
              "error_rate_after",
            ]),
        ...(paths.errorCost === "direct"
          ? ["cost_per_error"]
          : ["cost_per_clean_unit", "error_cost_multiplier"]),
        "cost_sources",
        "stages_downstream",
      ],
    });
  if (goals.includes("decision_speed"))
    sections.push({
      key: "decision_speed",
      title: GOAL_LABELS.decision_speed,
      question: "How much faster will decisions be?",
      ids: [
        "decisions_per_year",
        "days_to_decide_before",
        "days_to_decide_after",
        "cost_of_delay_per_day",
        "cost_of_delay_basis",
        "example_decision",
      ],
    });
  if (goals.includes("data_quality") || goals.includes("decision_speed"))
    sections.push({
      key: "classification",
      title: "Benefit type",
      question: "Cash or capacity?",
      ids: ["cost_nature"],
    });
  if (goals.includes("risk_reduction"))
    sections.push({
      key: "risk_reduction",
      title: GOAL_LABELS.risk_reduction,
      question: "How much risk will it remove?",
      ids: [
        "event_type",
        "aro_before",
        "aro_after",
        ...(paths.risk === "direct"
          ? ["loss_per_event"]
          : ["asset_value", "exposure_factor_pct"]),
        "cost_bearer",
      ],
    });
  sections.push({
    key: "costs",
    title: "Project costs",
    question: "What will it cost?",
    ids: [
      "cost_one_time_vendor_license",
      "cost_training_change",
      "cost_annual_run",
      "cost_one_time_internal_labor",
      "cost_annual_internal_support",
      "cost_uplift_pct",
      "delay_months",
      "baseline_alternative",
    ],
  });
  return sections;
}

const ALL_PATHS: Paths[] = [
  { time: "hours", quality: "counts", errorCost: "direct", risk: "direct" },
  { time: "tasks", quality: "rates", errorCost: "derived", risk: "asset" },
];
const ALL_GOALS = Object.keys(GOAL_LABELS) as Goal[];

/**
 * Ids that only belong to a goal or an input method. A save drops them when
 * that goal or method is not chosen, so a stale method never reaches the
 * engine. Every other record (e.g. project context) is kept as loaded.
 */
export const GOAL_SCOPED: ReadonlySet<string> = new Set(
  ALL_PATHS.flatMap((paths) =>
    sectionsFor(ALL_GOALS, paths)
      .filter(
        (section) => !["context", "settings", "costs"].includes(section.key),
      )
      .flatMap((section) => section.ids),
  ),
);

/**
 * Fields the Clarify step does not count as a gap when left empty: overrides
 * and free-text context. The form validator decides what is required.
 */
export const OPTIONAL: ReadonlySet<string> = new Set([
  "cost_uplift_pct",
  "baseline_alternative",
  "example_decision",
  "cost_sources",
  "stages_downstream",
  "realized_as_cash",
]);

export const pretty = (value: Input["value"]) =>
  value === null ? "" : Array.isArray(value) ? value.join(", ") : String(value);

export const hasNaN = (value: Input["value"]) =>
  Array.isArray(value)
    ? value.some((v) => typeof v === "number" && Number.isNaN(v))
    : typeof value === "number" && Number.isNaN(value);

/** Answered means a value, or an explicit "not sure". */
export const answered = (record: Input | undefined) =>
  record !== undefined &&
  (record.value !== null || record.tier === "user_unknown");

export const SOURCE_CHOICES = [
  ["estimate", "My best estimate"],
  ["documented", "Written source about our organization"],
  ["benchmark", "Comparable industry benchmark"],
  ["assumption", "Unverified assumption"],
  ["measured", "System record with confirmed passage"],
] as const;

export const TIER_LABELS: Record<Tier, string> = {
  measured: "Measured",
  documented: "Documented",
  benchmark: "Benchmark",
  estimate: "Estimate",
  assumption: "Assumption",
  user_unknown: "Not sure",
};

/** After-value checked against a before-value when the before changes. */
export const RELATED_AFTER: Record<string, string> = {
  minutes_per_task_before: "minutes_per_task_after",
  days_to_decide_before: "days_to_decide_after",
  error_rate_before: "error_rate_after",
  error_count_before: "error_count_after",
  aro_before: "aro_after",
};

/** Validator codes that reject a single field's typed value on blur. */
export const FIELD_ERROR_CODES = [
  "TYPE",
  "INTEGER",
  "BOUNDS",
  "ADOPTION_LENGTH",
  "AFTER_BEFORE",
  "ENUM",
  "RANGE",
  "UNKNOWN_ID",
];

/**
 * Typed text as an input record, keeping the previous record's metadata.
 * A changed value resets proxy/measured provenance to a user estimate and
 * clears confirmations that applied to the old value.
 */
export function recordFromText(
  id: string,
  text: string,
  previous: Input | undefined,
): Input | undefined {
  if (!text.trim()) return previous?.value === null ? previous : undefined;
  const rule = INPUT_RULES[id];
  if (!rule) return undefined;
  let value: Input["value"] = text;
  if (rule.kind === "number" || rule.kind === "integer") value = Number(text);
  if (rule.kind === "numbers")
    value = text
      .split(",")
      .map((part) => (part.trim() ? Number(part.trim()) : NaN));
  if (rule.kind === "strings")
    value = text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  const next: Input = {
    id,
    tier: "estimate",
    origin: "user",
    ...previous,
    ...(previous?.tier === "user_unknown"
      ? ({ tier: "estimate", origin: "user" } as const)
      : {}),
    value,
  };
  if (previous && JSON.stringify(previous.value) !== JSON.stringify(value)) {
    next.origin = "user";
    if (
      ["default", "proxy_accepted", "assistant_accepted"].includes(
        previous.origin,
      ) ||
      previous.tier === "measured"
    )
      next.tier = "estimate";
    if (next.backing)
      next.backing = {
        ...next.backing,
        quote_confirmed: false,
        verified: false,
      };
    if (
      previous.note === DEFAULTS[id]?.note ||
      previous.tier === "user_unknown"
    )
      delete next.note;
  }
  return next;
}

export const NOT_SURE_NOTE =
  "User is not sure; no zero value has been substituted.";

const MONEY = new Set([
  "cost_one_time_vendor_license",
  "cost_one_time_internal_labor",
  "cost_training_change",
  "cost_per_error",
  "cost_per_clean_unit",
  "loss_per_event",
  "asset_value",
]);
const MONEY_PER_YEAR = new Set([
  "cost_annual_run",
  "cost_annual_internal_support",
  "realized_as_cash",
]);
const UNITS: Record<string, string> = {
  discount_rate_pct: "%",
  adoption_by_year: "%",
  cost_uplift_pct: "%",
  recapture_pct: "%",
  error_rate_before: "%",
  error_rate_after: "%",
  exposure_factor_pct: "%",
  delay_months: "months",
  staff_affected: "people",
  hours_saved_per_staff_week: "h / week",
  minutes_per_task_before: "min",
  minutes_per_task_after: "min",
  tasks_per_staff_week: "/ week",
  weeks_per_year: "weeks",
  records_or_events_per_year: "/ year",
  error_count_before: "/ year",
  error_count_after: "/ year",
  decisions_per_year: "/ year",
  aro_before: "/ year",
  aro_after: "/ year",
  days_to_decide_before: "days",
  days_to_decide_after: "days",
  error_cost_multiplier: "×",
  stages_downstream: "stages",
};

/** Display unit for a field. Shown only; never written to the form. */
export function unitFor(id: string, currency: string): string | undefined {
  if (MONEY.has(id)) return currency;
  if (MONEY_PER_YEAR.has(id)) return `${currency} / year`;
  if (id === "loaded_hourly_cost") return `${currency} / h`;
  if (id === "cost_of_delay_per_day") return `${currency} / day`;
  return UNITS[id];
}

/** A record's value with its unit, or null when there is none. */
export function display(
  id: string,
  record: Input | undefined,
  currency: string,
): string | null {
  if (!record || record.value === null) return null;
  const value = Array.isArray(record.value)
    ? record.value.map(String).join(", ")
    : typeof record.value === "number"
      ? record.value.toLocaleString("en-US")
      : String(record.value).replaceAll("_", " ");
  const unit = unitFor(id, currency);
  if (!unit) return value;
  if (unit === "%") return `${value}%`;
  if (unit === currency) return `${value} ${currency}`;
  return `${value} ${unit}`;
}
