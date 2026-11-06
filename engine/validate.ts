import { BEFORE_AFTER, CATALOG, ESSENTIAL_COSTS } from "./catalog";
import type {
  FormFile,
  Input,
  ValidationIssue,
  ValidationReport,
} from "./types";

const TIERS = [
  "measured",
  "documented",
  "benchmark",
  "estimate",
  "assumption",
  "user_unknown",
];
const GOALS = [
  "time_savings",
  "data_quality",
  "decision_speed",
  "risk_reduction",
];
const ENUMS: Record<string, string[]> = {
  cost_nature: ["cash", "capacity"],
  cost_of_delay_basis: [
    "revenue_deferred",
    "cost_continuing",
    "risk_exposure",
    "opportunity_lost",
  ],
  cost_bearer: ["organization", "customer", "third_party"],
};
const TYPED_TIME_IDS = [
  "minutes_per_task_before",
  "minutes_per_task_after",
  "hours_saved_per_staff_week",
];

/** True when the input is absent, null or tier user_unknown: it never reaches a formula. */
export function isUnknown(i: Input | undefined): boolean {
  return (
    !i || i.value === null || i.value === undefined || i.tier === "user_unknown"
  );
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Pure validation. Errors make the form unusable, except MISSING_ESSENTIAL_COST which blocks the headline. */
export function validateInputs(form: FormFile): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (code: string, message: string, input_id?: string) =>
    errors.push({ code, message, ...(input_id ? { input_id } : {}) });
  const warn = (code: string, message: string, input_id?: string) =>
    warnings.push({ code, message, ...(input_id ? { input_id } : {}) });

  // ---- top-level settings ----
  if (!Array.isArray(form.goals) || form.goals.length === 0) {
    err("NO_GOALS", "At least one goal is required.");
  } else {
    for (const g of form.goals) {
      if (!GOALS.includes(g)) err("BAD_GOAL", `Unknown goal ${String(g)}.`);
    }
  }
  const byId = new Map<string, Input>();
  const inputs = Array.isArray(form.inputs) ? form.inputs : [];
  const scalar = (id: string): unknown => {
    const top = (form as unknown as Record<string, unknown>)[id];
    if (top !== undefined) return top;
    return byId.get(id)?.value;
  };
  for (const i of inputs) {
    if (byId.has(i.id))
      err("DUPLICATE_ID", `Input ${i.id} appears twice.`, i.id);
    else byId.set(i.id, i);
  }

  for (const id of ["horizon_years", "discount_rate_pct", "currency"]) {
    const v = scalar(id);
    if (v === undefined || v === null)
      err("MISSING_SETTING", `${id} is required.`, id);
  }
  const horizon = scalar("horizon_years");
  if (horizon !== undefined && horizon !== null) {
    if (
      !finite(horizon) ||
      !Number.isInteger(horizon) ||
      horizon < 1 ||
      horizon > 20
    )
      err(
        "BAD_HORIZON",
        "Horizon must be an integer from 1 to 20.",
        "horizon_years",
      );
  }
  const rate = scalar("discount_rate_pct");
  if (rate !== undefined && rate !== null) {
    if (!finite(rate) || rate < 0 || rate > 100)
      err("OUT_OF_BOUNDS", "Discount rate must be 0-100.", "discount_rate_pct");
  }
  const fileIds = new Set(Object.keys(form.file_descriptions ?? {}));

  for (const i of inputs) {
    const cat = CATALOG[i.id];
    if (!cat) {
      err("UNKNOWN_ID", `Unknown input id ${i.id}.`, i.id);
      continue;
    }
    if (!TIERS.includes(i.tier))
      err("BAD_TIER", `Unknown tier ${String(i.tier)}.`, i.id);
    if (i.tier === "user_unknown" && i.value !== null && i.value !== undefined)
      warn(
        "USER_UNKNOWN_VALUE_IGNORED",
        "Tier user_unknown: the value is not used.",
        i.id,
      );

    // role / field mismatch
    if (i.backing !== undefined && cat.role !== "effect")
      warn(
        "BACKING_IGNORED",
        `Backing on ${i.id} is ignored (not an effect input).`,
        i.id,
      );
    if (i.basis !== undefined && cat.role !== "cost")
      warn(
        "BASIS_IGNORED",
        `Basis on ${i.id} is ignored (not a cost input).`,
        i.id,
      );
    if (
      cat.role === "cost" &&
      i.id !== "cost_uplift_pct" &&
      i.basis === undefined &&
      !isUnknown(i)
    )
      warn(
        "COST_BASIS_DEFAULTED",
        `No basis on ${i.id}; the highest uplift (assumed) is used.`,
        i.id,
      );

    // foreign / unknown file id
    const sid = i.backing?.source_file_id;
    if (sid !== undefined && !fileIds.has(sid))
      err(
        "FOREIGN_FILE",
        `source_file_id ${sid} does not belong to this project.`,
        i.id,
      );

    // self-reported time cannot be measured
    if (
      TYPED_TIME_IDS.includes(i.id) &&
      i.tier === "measured" &&
      i.origin !== "file"
    )
      err(
        "SELF_REPORTED_MEASURED",
        "Typed or self-reported time savings can never be measured.",
        i.id,
      );

    if (i.value === null || i.value === undefined) continue;
    const v = i.value;
    switch (cat.kind) {
      case "text":
        if (typeof v !== "string") err("TYPE_MISMATCH", "Expected text.", i.id);
        break;
      case "bool":
        if (typeof v !== "boolean")
          err("TYPE_MISMATCH", "Expected true/false.", i.id);
        break;
      case "enum": {
        const allowed = ENUMS[i.id];
        if (typeof v !== "string" || (allowed && !allowed.includes(v)))
          err("BAD_ENUM", `Invalid value for ${i.id}.`, i.id);
        break;
      }
      case "array":
        if (i.id === "adoption_by_year") {
          if (!Array.isArray(v) || !v.every(finite)) {
            err("TYPE_MISMATCH", "Adoption must be a list of numbers.", i.id);
          } else {
            if (v.some((x) => x < 0 || x > 100))
              err("OUT_OF_BOUNDS", "Adoption values must be 0-100.", i.id);
            if (finite(horizon) && v.length !== horizon)
              err(
                "BAD_ADOPTION_LENGTH",
                `Adoption needs ${horizon} values, got ${v.length}.`,
                i.id,
              );
          }
        } else if (!Array.isArray(v))
          err("TYPE_MISMATCH", "Expected a list.", i.id);
        break;
      default: {
        if (!finite(v)) {
          err("TYPE_MISMATCH", "Expected a finite number.", i.id);
          break;
        }
        if (v < 0 && (cat.min ?? 0) >= 0) {
          err("NEGATIVE", "Negative values are not allowed.", i.id);
          break;
        }
        if (cat.kind === "int" && !Number.isInteger(v)) {
          err("NOT_INTEGER", "Must be a whole number.", i.id);
          break;
        }
        const below =
          cat.min !== undefined &&
          (cat.minExclusive ? v <= cat.min : v < cat.min);
        if (below || (cat.max !== undefined && v > cat.max))
          err("OUT_OF_BOUNDS", `Value ${v} outside the allowed range.`, i.id);
        if (cat.kind === "percent" && (v < 0 || v > (cat.max ?? 100)))
          err("OUT_OF_BOUNDS", "Percent outside range.", i.id);
      }
    }
    for (const k of ["low", "high"] as const) {
      const bound = i[k];
      if (bound !== undefined && !finite(bound))
        err("TYPE_MISMATCH", `${k} must be a number.`, i.id);
    }
  }

  // after > before
  for (const [b, a] of BEFORE_AFTER) {
    const vb = byId.get(b)?.value;
    const va = byId.get(a)?.value;
    if (finite(vb) && finite(va) && va > vb)
      err("AFTER_GT_BEFORE", `${a} (${va}) is greater than ${b} (${vb}).`, a);
  }

  // essential costs
  for (const id of ESSENTIAL_COSTS) {
    if (isUnknown(byId.get(id)))
      err(
        "MISSING_ESSENTIAL_COST",
        `Essential cost ${id} is missing or unknown.`,
        id,
      );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export const BLOCKING_CODES = ["MISSING_ESSENTIAL_COST"];
