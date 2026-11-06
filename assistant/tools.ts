// Tool layer: thin wrappers over the engine. JSON in, JSON out, arguments validated against a
// JSON Schema (never coerced). Tools never edit the form or a result; every output is a deep-frozen
// copy. The model-free engine does all arithmetic.
import {
  CATALOG,
  DEFAULT_CONFIG,
  DRIVER_ORDER,
  EngineIntegrityError,
  EngineValidationError,
  computeProject,
  defaultFor,
  effectiveTier,
  evaluateEffect,
  getDefaults,
  validateInputs,
  type DriverId,
  type EngineConfig,
  type LegacyFormFile,
  type Input,
  type Override,
  type RunOutput,
} from "../engine";
import { validateSchema, type JsonSchema } from "./schema";

// ---------- shared shapes ----------
export interface Question {
  id: string;
  run_id: string;
  text: string;
  why_blocking: string;
  affects: string[];
  options: ("value" | "use_proxy" | "exclude")[];
}

export class ToolArgError extends Error {
  readonly code = "INVALID_ARGS";
  constructor(
    public readonly tool: string,
    public readonly problems: string[],
  ) {
    super(`Invalid arguments for ${tool}: ${problems.join("; ")}`);
    this.name = "ToolArgError";
  }
}
export class UnknownToolError extends Error {
  readonly code = "UNKNOWN_TOOL";
  constructor(public readonly tool: string) {
    super(`Unknown tool ${tool}`);
    this.name = "UnknownToolError";
  }
}
export class ToolRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolRuntimeError";
  }
}

export const MAX_QUESTIONS_PER_RUN = 3;
export const ASK_EFFECT_THRESHOLD = 0.05; // ROI.md 11.1: proxy changes a headline number by more than 5%

export interface ToolState {
  asked_this_run: string[];
  last: RunOutput | null;
  /** Every tool output of this run (frozen); the provenance set for model-written numbers. */
  seen: unknown[];
}
export interface ToolContext {
  readonly form: LegacyFormFile; // deep-frozen
  readonly run_id: string;
  readonly now: string; // ISO, pure "now" for the engine
  readonly mode: "real" | "stub";
  readonly config?: Partial<EngineConfig>;
  readonly state: ToolState;
  /** Host callback: has the user accepted this override? The model cannot set it. */
  readonly isAccepted: (what: {
    kind: "override";
    path: string;
    value: number;
  }) => boolean;
}

export function deepFreeze<T>(x: T): T {
  if (typeof x === "object" && x !== null && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}
export function frozenCopy<T>(x: T): T {
  return deepFreeze(structuredClone(x));
}

export function createContext(
  form: LegacyFormFile,
  o: {
    run_id: string;
    now: string;
    mode?: "real" | "stub";
    config?: Partial<EngineConfig>;
    isAccepted?: ToolContext["isAccepted"];
  },
): ToolContext {
  return {
    form: frozenCopy(form),
    run_id: o.run_id,
    now: o.now,
    mode: o.mode ?? "real",
    ...(o.config ? { config: o.config } : {}),
    state: { asked_this_run: [], last: null, seen: [] },
    isAccepted: o.isAccepted ?? (() => false),
  };
}

// ---------- engine helpers ----------
const RELAXED: Partial<EngineConfig> = {
  driver_floors: {
    time_savings: 0,
    data_quality: 0,
    decision_speed: 0,
    risk_reduction: 0,
  },
  project_floor: 0,
};

function runEngine(
  ctx: ToolContext,
  form: LegacyFormFile = ctx.form,
  config?: Partial<EngineConfig>,
): RunOutput {
  const merged = { ...(ctx.config ?? {}), ...(config ?? {}) };
  return computeProject(form, {
    run_id: ctx.run_id,
    generated_at: ctx.now,
    mode: ctx.mode,
    ...(Object.keys(merged).length ? { config: merged } : {}),
  });
}
function safeRun(
  ctx: ToolContext,
  form?: LegacyFormFile,
  config?: Partial<EngineConfig>,
): RunOutput | null {
  try {
    return runEngine(ctx, form, config);
  } catch (e) {
    if (e instanceof EngineValidationError || e instanceof EngineIntegrityError)
      return null;
    throw e;
  }
}
function lastOutput(ctx: ToolContext): RunOutput {
  if (!ctx.state.last) ctx.state.last = runEngine(ctx);
  return ctx.state.last;
}
function cfgOf(ctx: ToolContext): EngineConfig {
  return { ...DEFAULT_CONFIG, ...(ctx.config ?? {}) };
}
function inputOf(ctx: ToolContext, id: string): Input | undefined {
  return ctx.form.inputs.find((i) => i.id === id);
}
function evidenceCtx(ctx: ToolContext) {
  return {
    cfg: cfgOf(ctx),
    known_file_ids: new Set(Object.keys(ctx.form.file_descriptions ?? {})),
    now: new Date(ctx.now),
  };
}
const TYPED_TIME = [
  "minutes_per_task_before",
  "minutes_per_task_after",
  "hours_saved_per_staff_week",
];

/** Which drivers a missing input would affect (static map over the catalog ids). */
const INPUT_DRIVERS: Record<string, DriverId[]> = {
  staff_affected: ["time_savings"],
  weeks_per_year: ["time_savings"],
  loaded_hourly_cost: ["time_savings"],
  recapture_pct: ["time_savings"],
  hours_saved_per_staff_week: ["time_savings"],
  minutes_per_task_before: ["time_savings"],
  minutes_per_task_after: ["time_savings"],
  tasks_per_staff_week: ["time_savings"],
  realized_as_cash: ["time_savings"],
  records_or_events_per_year: ["data_quality"],
  error_rate_before: ["data_quality"],
  error_rate_after: ["data_quality"],
  error_count_before: ["data_quality"],
  error_count_after: ["data_quality"],
  cost_per_error: ["data_quality"],
  cost_per_clean_unit: ["data_quality"],
  error_cost_multiplier: ["data_quality"],
  decisions_per_year: ["decision_speed"],
  days_to_decide_before: ["decision_speed"],
  days_to_decide_after: ["decision_speed"],
  cost_of_delay_per_day: ["decision_speed"],
  aro_before: ["risk_reduction"],
  aro_after: ["risk_reduction"],
  loss_per_event: ["risk_reduction"],
  asset_value: ["risk_reduction"],
  exposure_factor_pct: ["risk_reduction"],
};
function affectsOf(id: string, form: LegacyFormFile): string[] {
  const d = INPUT_DRIVERS[id];
  if (!d) return [...form.goals];
  return d.filter((x) => form.goals.includes(x));
}

// ---------- tool definitions ----------
export interface ToolDef {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (args: Record<string, unknown>, ctx: ToolContext) => unknown;
}

const EMPTY: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};
const DRIVER_ENUM = [...DRIVER_ORDER];
const ID_SCHEMA: JsonSchema = {
  type: "string",
  minLength: 1,
  maxLength: 80,
  pattern: "^[a-z0-9_]+$",
};

function str(a: Record<string, unknown>, k: string): string {
  return a[k] as string;
}

const validate_inputs: ToolDef = {
  name: "validate_inputs",
  description:
    "Validate the saved form file: bounds, unknown ids, missing essential costs. Returns errors, warnings and ranked gaps.",
  parameters: EMPTY,
  run: (_a, ctx) => {
    const report = validateInputs(ctx.form);
    const out = safeRun(ctx, undefined, RELAXED);
    const gaps =
      out?.kind === "gap_list"
        ? (out.gap_list?.items ?? [])
        : (out?.result?.unquantified ?? []).map((u, i) => ({
            rank: i + 1,
            target: u.target,
            what_to_add: u.raise_with,
          }));
    return {
      ok: report.ok,
      errors: report.errors,
      warnings: report.warnings,
      gaps,
    };
  },
};

const get_defaults: ToolDef = {
  name: "get_defaults",
  description:
    "Labeled default (proxy) per input for the selected goals, with source and tier. A default is never used until the user accepts it.",
  parameters: {
    type: "object",
    properties: {
      goals: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", enum: DRIVER_ENUM },
      },
    },
    required: ["goals"],
    additionalProperties: false,
  },
  run: (a, ctx) => ({
    defaults: getDefaults(a["goals"] as DriverId[]).map((d) => ({
      ...d,
      already_in_form:
        inputOf(ctx, d.id) !== undefined && inputOf(ctx, d.id)?.value !== null,
    })),
  }),
};

const preflight_gate: ToolDef = {
  name: "preflight_gate",
  description:
    "Dry run of validation and the confidence gate. Returns confidence per driver, which drivers are below floor and the cheapest fixes. No headline number.",
  parameters: EMPTY,
  run: (_a, ctx) => {
    const report = validateInputs(ctx.form);
    const out = safeRun(ctx);
    if (!out) return { passed: false, validation_errors: report.errors };
    if (out.kind === "result" && out.result) {
      return {
        passed: true,
        validation_errors: [],
        drivers: out.result.confidence.drivers,
        project: out.result.confidence.project,
        cheapest_fixes: [],
      };
    }
    return {
      passed: false,
      validation_errors: report.errors.filter(
        (e) => e.code !== "MISSING_ESSENTIAL_COST",
      ),
      project_confidence: out.gap_list?.project_confidence ?? 0,
      project_floor: out.gap_list?.project_floor ?? 0,
      dropped_drivers: out.gap_list?.dropped_drivers ?? [],
      cheapest_fixes: (out.gap_list?.items ?? []).slice(0, 5),
    };
  },
};

const compute_haircut: ToolDef = {
  name: "compute_haircut",
  description:
    "Deterministic tier, six backing checks, backing score, band and haircut for one effect input.",
  parameters: {
    type: "object",
    properties: { input_id: ID_SCHEMA },
    required: ["input_id"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const id = str(a, "input_id");
    const inp = inputOf(ctx, id);
    if (!inp)
      throw new ToolRuntimeError(
        "INPUT_NOT_FOUND",
        `No input ${id} in the form`,
      );
    if (CATALOG[id]?.role !== "effect")
      throw new ToolRuntimeError(
        "NOT_EFFECT_INPUT",
        `${id} is not an effect input; no haircut applies`,
      );
    const e = evaluateEffect(inp, evidenceCtx(ctx), TYPED_TIME.includes(id));
    return {
      input_id: id,
      stated_tier: e.stated_tier,
      tier: e.tier,
      checks: e.checks,
      backing_score: e.b,
      band: [e.h_min, e.h_max],
      haircut: e.h,
      confidence: e.c,
      explanation: `Tier ${e.tier}; passed checks: ${
        Object.entries(e.checks)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ") || "none"
      }; ${e.note ?? "no tier change"}.`,
    };
  },
};

const propose_backing: ToolDef = {
  name: "propose_backing",
  description:
    "Propose structured backing for an effect input from a file passage. Nothing is written until the user accepts and confirms the quote.",
  parameters: {
    type: "object",
    properties: {
      input_id: ID_SCHEMA,
      evidence: {
        type: "object",
        properties: {
          file_id: { type: "string", minLength: 1, maxLength: 120 },
          quote: { type: "string", minLength: 1, maxLength: 500 },
          observations: { type: "integer", minimum: 0 },
          period_months: { type: "integer", minimum: 0, maximum: 600 },
          source_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          second_source_value: { type: "number" },
          low: { type: "number" },
          high: { type: "number" },
        },
        required: ["file_id", "quote"],
        additionalProperties: false,
      },
    },
    required: ["input_id", "evidence"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const id = str(a, "input_id");
    const ev = a["evidence"] as Record<string, unknown>;
    const inp = inputOf(ctx, id);
    if (!inp)
      throw new ToolRuntimeError(
        "INPUT_NOT_FOUND",
        `No input ${id} in the form`,
      );
    if (CATALOG[id]?.role !== "effect")
      throw new ToolRuntimeError(
        "NOT_EFFECT_INPUT",
        "Backing is only asked for effect inputs",
      );
    const fileId = ev["file_id"] as string;
    if (!(fileId in (ctx.form.file_descriptions ?? {})))
      throw new ToolRuntimeError(
        "FOREIGN_FILE",
        "That file is not in this project",
      );
    const backing = {
      ...(inp.backing ?? {}),
      source_file_id: fileId,
      quote: ev["quote"] as string,
      quote_confirmed: false,
      ...(ev["observations"] !== undefined
        ? { observations: ev["observations"] as number }
        : {}),
      ...(ev["period_months"] !== undefined
        ? { period_months: ev["period_months"] as number }
        : {}),
      ...(ev["source_date"] !== undefined
        ? { source_date: ev["source_date"] as string }
        : {}),
      ...(ev["second_source_value"] !== undefined
        ? { second_source_value: ev["second_source_value"] as number }
        : {}),
    };
    const range = {
      ...(ev["low"] !== undefined ? { low: ev["low"] as number } : {}),
      ...(ev["high"] !== undefined ? { high: ev["high"] as number } : {}),
    };
    const ec = evidenceCtx(ctx);
    const before = evaluateEffect(inp, ec, TYPED_TIME.includes(id));
    // preview assumes the user confirms the quote
    const preview: Input = {
      ...inp,
      ...range,
      backing: { ...backing, quote_confirmed: true },
      tier: inp.tier,
    };
    const upgrade = effectiveTier(
      {
        ...preview,
        tier: "measured",
        origin: inp.origin === "file" ? "file" : "user",
      },
      ec,
      TYPED_TIME.includes(id),
    );
    const proposedTier = upgrade.tier === "measured" ? "measured" : inp.tier;
    const after = evaluateEffect(
      { ...preview, tier: proposedTier },
      ec,
      TYPED_TIME.includes(id),
    );
    return {
      kind: "backing",
      status: "proposed",
      input_id: id,
      backing,
      ...range,
      proposed_tier: proposedTier,
      origin_if_accepted: "assistant_accepted",
      requires_user_confirmation: true,
      effect_if_accepted: {
        tier_before: before.tier,
        tier_after: after.tier,
        haircut_before: before.h,
        haircut_after: after.h,
      },
    };
  },
};

const propose_adjustment: ToolDef = {
  name: "propose_adjustment",
  description:
    "Propose a caveat or value change taken from the user's notes. Tier assumption; not applied until the user accepts.",
  parameters: {
    type: "object",
    properties: {
      input_id: ID_SCHEMA,
      reason: { type: "string", minLength: 1, maxLength: 300 },
      source_quote: { type: "string", minLength: 1, maxLength: 500 },
      proposed_value: { type: "number" },
    },
    required: ["input_id", "reason", "source_quote"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const id = str(a, "input_id");
    if (!(id in CATALOG))
      throw new ToolRuntimeError("UNKNOWN_ID", `Unknown input id ${id}`);
    const v = a["proposed_value"] as number | undefined;
    const quote = str(a, "source_quote");
    if (v !== undefined && !quote.replace(/,/g, "").includes(String(v)))
      throw new ToolRuntimeError(
        "NUMBER_NOT_IN_SOURCE",
        "A proposed number must appear in the user's own text",
      );
    if (quote.length > 0 && !(ctx.form.other_notes ?? "").includes(quote))
      throw new ToolRuntimeError(
        "QUOTE_NOT_IN_NOTES",
        "source_quote must be copied from the user's notes",
      );
    return {
      kind: "adjustment",
      status: "proposed",
      input_id: id,
      reason: str(a, "reason"),
      source_quote: quote,
      ...(v !== undefined ? { proposed_value: v } : {}),
      tier_if_accepted: "assumption",
      origin_if_accepted: "assistant_accepted",
    };
  },
};

const compute_driver: ToolDef = {
  name: "compute_driver",
  description:
    "Ordered steps (gross, adoption, recapture, haircut) with refs for one driver, computed by the engine.",
  parameters: {
    type: "object",
    properties: { driver_id: { type: "string", enum: DRIVER_ENUM } },
    required: ["driver_id"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const id = str(a, "driver_id") as DriverId;
    const out = safeRun(ctx, { ...ctx.form, goals: [id] }, RELAXED);
    if (!out)
      throw new ToolRuntimeError(
        "INVALID_FORM",
        "The form is invalid; run validate_inputs",
      );
    if (out.kind === "gap_list")
      return {
        status: "blocked",
        reason: out.gap_list?.reason ?? "",
        missing: (out.gap_list?.items ?? []).map((i) => i.target),
      };
    const d = out.result?.drivers[0];
    if (!d)
      return {
        status: "unquantified",
        unquantified:
          out.result?.unquantified.filter((u) => u.target === id) ?? [],
      };
    const floor = cfgOf(ctx).driver_floors[id];
    return {
      status: "ok",
      driver: d,
      floor,
      passes_floor: d.confidence >= floor - 1e-12,
    };
  },
};

const compute_project: ToolDef = {
  name: "compute_project",
  description:
    "Run the whole engine on the form: drivers, totals, NPV, both ROIs, payback, scenarios, warnings, or a gap list.",
  parameters: {
    type: "object",
    properties: {
      scenario: {
        type: "string",
        enum: ["conservative", "expected", "optimistic"],
      },
    },
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const out = runEngine(ctx);
    ctx.state.last = out;
    const sc = a["scenario"] as
      "conservative" | "expected" | "optimistic" | undefined;
    if (sc && sc !== "expected" && out.result)
      return {
        kind: "scenario",
        scenario: sc,
        summary: out.result.scenarios[sc],
      };
    return out;
  },
};

const sensitivity: ToolDef = {
  name: "sensitivity",
  description:
    "NPV across discount rates, adoption multipliers or extra haircut points. Optional custom values.",
  parameters: {
    type: "object",
    properties: {
      param: { type: "string", enum: ["discount_rate", "adoption", "haircut"] },
      values: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: { type: "number", minimum: 0, maximum: 100 },
      },
    },
    required: ["param"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const param = str(a, "param") as "discount_rate" | "adoption" | "haircut";
    const values = a["values"] as number[] | undefined;
    const base = cfgOf(ctx).sensitivity;
    const sens = {
      ...base,
      ...(values
        ? {
            [param === "discount_rate"
              ? "discount_rates_pct"
              : param === "adoption"
                ? "adoption_mults"
                : "extra_haircut_pts"]: values,
          }
        : {}),
    };
    const out = runEngine(ctx, ctx.form, { sensitivity: sens });
    if (out.kind !== "result" || !out.result)
      return { status: "no_result", reason: out.gap_list?.reason ?? "" };
    return {
      status: "ok",
      param,
      x_label: out.result.sensitivity.x_labels[param],
      points: out.result.sensitivity[param],
    };
  },
};

const explain_step: ToolDef = {
  name: "explain_step",
  description:
    "Plain-text formula and inputs of one step or cost line by its ref. Text only; no new numbers.",
  parameters: {
    type: "object",
    properties: { ref: { type: "string", pattern: "^[A-Z][0-9]{1,3}$" } },
    required: ["ref"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const ref = str(a, "ref");
    const out = lastOutput(ctx);
    if (out.kind !== "result" || !out.result)
      throw new ToolRuntimeError("NO_RESULT", "No released result to explain");
    for (const d of out.result.drivers)
      for (const s of d.steps)
        if (s.ref === ref)
          return {
            ref,
            text: `${s.label}: ${s.formula}. Inputs: ${s.inputs.map((i) => `${i.label} = ${i.value}`).join("; ") || "carried from the previous step"}. Value over the horizon: ${s.value}.`,
          };
    const l = out.result.costs.lines.find((x) => x.ref === ref);
    if (l)
      return {
        ref,
        text: `${l.label}: base ${l.base}, ${l.basis} basis, uplift ${l.uplift_pct}%, adjusted ${l.adjusted}.`,
      };
    throw new ToolRuntimeError("REF_NOT_FOUND", `No step or cost line ${ref}`);
  },
};

const get_confidence: ToolDef = {
  name: "get_confidence",
  description:
    "Confidence ledger: integrity checks, confidence per driver, project confidence and floors.",
  parameters: EMPTY,
  run: (_a, ctx) => {
    const out = lastOutput(ctx);
    if (out.kind === "result" && out.result)
      return { kind: "result", ...out.result.confidence };
    return {
      kind: "gap_list",
      project_confidence: out.gap_list?.project_confidence ?? 0,
      project_floor: out.gap_list?.project_floor ?? 0,
      dropped_drivers: out.gap_list?.dropped_drivers ?? [],
    };
  },
};

const release_gate: ToolDef = {
  name: "release_gate",
  description:
    "Pass or fail with reasons. On fail returns the ranked gap list; a failed gate is an outcome, not an error.",
  parameters: EMPTY,
  run: (_a, ctx) => {
    const out = lastOutput(ctx);
    if (out.kind === "result" && out.result)
      return {
        passed: true,
        reasons: [
          "Integrity checks passed",
          "Every included driver is at or above its floor",
          "Project confidence is at or above the project floor",
        ],
      };
    return {
      passed: false,
      reasons: [out.gap_list?.reason ?? "Gate failed"],
      gap_list: out.gap_list,
    };
  },
};

const ask_user: ToolDef = {
  name: "ask_user",
  description:
    "Ask the user a blocker question on the loading page. Allowed only when the value is not in the form, was not asked before, and a labeled proxy would change a headline number by more than 5% or push a driver below its floor. Max 3 per run, batched. Pauses the run.",
  parameters: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: MAX_QUESTIONS_PER_RUN,
        items: {
          type: "object",
          properties: {
            input_id: ID_SCHEMA,
            text: { type: "string", minLength: 1, maxLength: 300 },
            why_blocking: { type: "string", minLength: 1, maxLength: 300 },
          },
          required: ["input_id", "text", "why_blocking"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const items = a["questions"] as {
      input_id: string;
      text: string;
      why_blocking: string;
    }[];
    const questions: Question[] = [];
    const not_asked: {
      input_id: string;
      reason: string;
      proxy?: { value: number; tier: string; source: string };
    }[] = [];
    const asked = new Set([
      ...(ctx.form.asked ?? []),
      ...ctx.state.asked_this_run,
    ]);
    for (const it of items) {
      const reject = (
        reason: string,
        proxy?: { value: number; tier: string; source: string },
      ) =>
        not_asked.push({
          input_id: it.input_id,
          reason,
          ...(proxy ? { proxy } : {}),
        });
      if (!(it.input_id in CATALOG)) {
        reject("unknown_input_id");
        continue;
      }
      if (/\d/.test(it.text) || /\d/.test(it.why_blocking)) {
        reject("question_text_must_not_contain_numbers");
        continue;
      }
      const cur = inputOf(ctx, it.input_id);
      if (cur && cur.value !== null && cur.tier !== "user_unknown") {
        reject("value_already_in_form");
        continue;
      }
      if (asked.has(it.input_id)) {
        reject("already_asked");
        continue;
      }
      if (ctx.state.asked_this_run.length >= MAX_QUESTIONS_PER_RUN) {
        reject("cap_reached_remaining_become_unquantified");
        continue;
      }
      const def = defaultFor(it.input_id);
      if (!def) {
        reject("no_labeled_proxy_so_the_benefit_is_excluded");
        continue;
      }
      const trig = triggerCheck(ctx, it.input_id);
      const proxy = { value: def.value, tier: def.tier, source: def.source };
      if (!trig.ask) {
        reject("proxy_is_immaterial_use_it_labeled", proxy);
        continue;
      }
      ctx.state.asked_this_run.push(it.input_id);
      asked.add(it.input_id);
      questions.push({
        id: `q_${ctx.run_id}_${ctx.state.asked_this_run.length}`,
        run_id: ctx.run_id,
        text: it.text,
        why_blocking: `${it.why_blocking} ${trig.why}`,
        affects: affectsOf(it.input_id, ctx.form),
        options: ["value", "use_proxy", "exclude"],
      });
    }
    return { pause: questions.length > 0, questions, not_asked };
  },
};

/** ROI.md 11.1 (b): would the labeled proxy change a headline number by more than 5% or push a driver below its floor? */
export function triggerCheck(
  ctx: ToolContext,
  inputId: string,
): { ask: boolean; why: string } {
  const def = defaultFor(inputId);
  if (!def) return { ask: false, why: "" };
  const withProxy: LegacyFormFile = {
    ...ctx.form,
    inputs: [
      ...ctx.form.inputs.filter((i) => i.id !== inputId),
      { id: inputId, value: def.value, tier: def.tier, origin: "default" },
    ],
  };
  const without: LegacyFormFile = {
    ...ctx.form,
    inputs: ctx.form.inputs.filter((i) => i.id !== inputId),
  };
  const A = safeRun(ctx, withProxy);
  const B = safeRun(ctx, without);
  if (!A) return { ask: false, why: "" };
  if (A.kind !== "result" || !A.result)
    return {
      ask: true,
      why: "Using the labeled proxy would leave the project below its confidence floor.",
    };
  if (A.result.confidence.drivers.some((d) => !d.included))
    return {
      ask: true,
      why: "Using the labeled proxy would push a driver below its confidence floor.",
    };
  if (!B || B.kind !== "result" || !B.result)
    return {
      ask: true,
      why: "Without this value no headline can be produced.",
    };
  const a = A.result.headline.npv.capacity_inclusive ?? 0;
  const b = B.result.headline.npv.capacity_inclusive ?? 0;
  const rel = Math.abs(a - b) / Math.max(Math.abs(a), 1e-9);
  return rel > ASK_EFFECT_THRESHOLD
    ? {
        ask: true,
        why: `Using the labeled proxy would change net present value by ${(rel * 100).toFixed(1)}%.`,
      }
    : { ask: false, why: "" };
}

const apply_override: ToolDef = {
  name: "apply_override",
  description:
    "Record an accepted override of a result number. The computed value is kept next to the override. Applies only if the user accepted it; the result itself is never edited.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        pattern: "^[a-z_]+(\\.[a-z_]+)*$",
        maxLength: 120,
      },
      value: { type: "number" },
      reason: { type: "string", minLength: 1, maxLength: 300 },
      author: { type: "string", minLength: 1, maxLength: 120 },
    },
    required: ["path", "value", "reason", "author"],
    additionalProperties: false,
  },
  run: (a, ctx) => {
    const path = str(a, "path");
    const value = a["value"] as number;
    if (!ctx.isAccepted({ kind: "override", path, value }))
      return { applied: false, reason: "not_accepted_by_user" };
    const out = lastOutput(ctx);
    let cur: unknown = out.result;
    for (const k of path.split("."))
      cur =
        typeof cur === "object" && cur !== null
          ? (cur as Record<string, unknown>)[k]
          : undefined;
    if (typeof cur !== "number")
      throw new ToolRuntimeError(
        "PATH_NOT_NUMERIC",
        `${path} is not a number in the result`,
      );
    const override: Override = {
      path,
      computed_value: cur,
      override_value: value,
      reason: str(a, "reason"),
      author: str(a, "author"),
      at: ctx.now,
    };
    return { applied: true, override };
  },
};

export const TOOLS: readonly ToolDef[] = [
  validate_inputs,
  get_defaults,
  preflight_gate,
  compute_haircut,
  propose_backing,
  propose_adjustment,
  compute_driver,
  compute_project,
  sensitivity,
  explain_step,
  get_confidence,
  release_gate,
  ask_user,
  apply_override,
];

/** ask_user is tabled until after the demo: the tool and its tests stay, the model is not offered it. */
export const ASK_USER_ENABLED = false;
/** The tools offered to the model in the live loop. */
export const MODEL_TOOLS: readonly ToolDef[] = TOOLS.filter(
  (t) => ASK_USER_ENABLED || t.name !== "ask_user",
);

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Validate the arguments (never coerced), run the tool, return a deep-frozen copy. */
export function callTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
): unknown {
  const tool = BY_NAME.get(name);
  if (!tool) throw new UnknownToolError(name);
  const problems = validateSchema(tool.parameters, args ?? {});
  if (problems.length > 0) throw new ToolArgError(name, problems);
  const out = frozenCopy(
    tool.run((args ?? {}) as Record<string, unknown>, ctx),
  );
  ctx.state.seen.push(out);
  return out;
}

// ---------- host-side acceptance (not a model tool) ----------
export interface Acceptance {
  accepted: boolean;
  quote_confirmed?: boolean;
}
/** Apply a proposal to the form only if the user accepted. Returns a new form; never mutates. */
export function applyProposal(
  form: LegacyFormFile,
  proposal: Record<string, unknown>,
  acceptance: Acceptance,
): LegacyFormFile {
  if (!acceptance.accepted)
    throw new ToolRuntimeError(
      "NOT_ACCEPTED",
      "The user has not accepted this proposal",
    );
  const id = proposal["input_id"] as string;
  const inputs = form.inputs.map((i) => ({ ...i }));
  const idx = inputs.findIndex((i) => i.id === id);
  if (proposal["kind"] === "backing") {
    const cur = inputs[idx];
    if (!cur) throw new ToolRuntimeError("INPUT_NOT_FOUND", id);
    const backing = {
      ...(proposal["backing"] as Record<string, unknown>),
      quote_confirmed: acceptance.quote_confirmed === true,
    };
    const upgrade =
      proposal["proposed_tier"] === "measured" &&
      acceptance.quote_confirmed === true;
    inputs[idx] = {
      ...cur,
      ...(proposal["low"] !== undefined
        ? { low: proposal["low"] as number }
        : {}),
      ...(proposal["high"] !== undefined
        ? { high: proposal["high"] as number }
        : {}),
      backing: backing,
      tier: upgrade ? "measured" : cur.tier,
      origin: "assistant_accepted",
    };
  } else if (proposal["kind"] === "adjustment") {
    const next: Input = {
      id,
      value: (proposal["proposed_value"] as number | undefined) ?? null,
      tier: "assumption",
      origin: "assistant_accepted",
      note: proposal["reason"] as string,
    };
    if (idx >= 0) inputs[idx] = { ...(inputs[idx] as Input), ...next };
    else inputs.push(next);
  } else throw new ToolRuntimeError("BAD_PROPOSAL", "Unknown proposal kind");
  return { ...form, inputs };
}
