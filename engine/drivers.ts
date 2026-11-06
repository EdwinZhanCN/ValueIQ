// DRIVER LAYER: gross -> adoption -> recapture (time savings only) -> haircut, per year.
import { CATALOG, DRIVER_LABELS } from "./catalog";
import { evaluateEffect, type EffectEval, type EvidenceCtx } from "./evidence";
import { isUnknown } from "./validate";
import type { DriverId, Input, LabelClass, Origin } from "./types";

export interface Params {
  adoption_mult: number;
  recapture_delta_pts: number;
  hmode: "computed" | "min" | "max";
  extra_haircut_pts: number;
}
export const BASE_PARAMS: Params = {
  adoption_mult: 1,
  recapture_delta_pts: 0,
  hmode: "computed",
  extra_haircut_pts: 0,
};

export interface StepInput {
  id: string;
  label: string;
  value: number | string;
}

export interface PreparedDriver {
  id: DriverId;
  label: string;
  label_class: LabelClass;
  status: "ok" | "unquantified";
  missing: string[]; // ids of missing or unknown inputs
  effects: EffectEval[];
  cash: EffectEval | null; // time savings: documented cash reduction
  cash_amount: number;
  gross_annual: number;
  adoption: number[]; // fractions per operating year
  recapture_pct: number | null; // time savings only
  source_type: "user" | "file" | "default" | "proxy";
  gross_formula: string;
  gross_inputs: StepInput[];
  notes: string[];
  recapture_origin: "user" | "file" | "default" | "proxy";
  recapture_tier: EffectEval["tier"] | "benchmark" | null;
}

export interface DriverCalc {
  gross: number[];
  adopted: number[];
  recaptured: number[];
  adjusted: number[]; // after haircut (before cash netting for time savings)
  hard: number[]; // operating-year hard savings
  capacity: number[]; // operating-year other value (capacity, avoided loss, ...)
  haircut: number;
}

export interface PrepContext extends EvidenceCtx {
  byId: Map<string, Input>;
  horizon: number;
}

function srcType(o: Origin | undefined): "user" | "file" | "default" | "proxy" {
  if (o === "file") return "file";
  if (o === "default") return "default";
  if (o === "proxy_accepted" || o === "assistant_accepted") return "proxy";
  return "user";
}

function num(ctx: PrepContext, id: string): number | null {
  const i = ctx.byId.get(id);
  if (isUnknown(i)) return null;
  return typeof i?.value === "number" ? i.value : null;
}
function lbl(id: string): string {
  return CATALOG[id]?.label ?? id;
}
function si(ctx: PrepContext, id: string): StepInput {
  return { id, label: lbl(id), value: num(ctx, id) ?? "" };
}

function emptyDriver(id: DriverId, missing: string[]): PreparedDriver {
  return {
    id,
    label: DRIVER_LABELS[id],
    label_class: "capacity_value",
    status: "unquantified",
    missing,
    effects: [],
    cash: null,
    cash_amount: 0,
    gross_annual: 0,
    adoption: [],
    recapture_pct: null,
    source_type: "user",
    gross_formula: "",
    gross_inputs: [],
    notes: [],
    recapture_origin: "user",
    recapture_tier: null,
  };
}

function adoptionOf(ctx: PrepContext): number[] | null {
  const a = ctx.byId.get("adoption_by_year");
  if (isUnknown(a) || !Array.isArray(a?.value)) return null;
  const v = a.value as unknown[];
  if (v.length !== ctx.horizon || !v.every((x) => typeof x === "number"))
    return null;
  return v.map((x) => x / 100);
}

function weakest(effects: EffectEval[]): EffectEval | undefined {
  let w: EffectEval | undefined;
  for (const e of effects) if (!w || e.h > w.h) w = e;
  return w;
}

export function prepareDriver(id: DriverId, ctx: PrepContext): PreparedDriver {
  const missing: string[] = [];
  const need = (...ids: string[]) => {
    for (const k of ids) if (num(ctx, k) === null) missing.push(k);
  };
  const adoption = adoptionOf(ctx);
  if (!adoption) missing.push("adoption_by_year");
  const effectOf = (k: string, typedTime = false): EffectEval => {
    const inp = ctx.byId.get(k) as Input;
    return evaluateEffect(inp, ctx, typedTime);
  };
  const finish = (
    p: PreparedDriver,
    effects: EffectEval[],
    inputs: StepInput[],
    formula: string,
    gross: number,
  ): PreparedDriver => {
    const w = weakest(effects);
    const origin = w ? ctx.byId.get(w.id)?.origin : undefined;
    return {
      ...p,
      status: "ok",
      effects,
      gross_annual: gross,
      adoption: adoption ?? [],
      source_type: srcType(origin),
      gross_formula: formula,
      gross_inputs: inputs,
      notes: effects.flatMap((e) =>
        e.note ? [`${lbl(e.id)}: ${e.note}`] : [],
      ),
    };
  };

  if (id === "time_savings") {
    need(
      "staff_affected",
      "weeks_per_year",
      "loaded_hourly_cost",
      "recapture_pct",
    );
    let hours: number | null = num(ctx, "hours_saved_per_staff_week");
    let effects: EffectEval[] = [];
    let hoursInputs: StepInput[] = [];
    let hoursFormula = "";
    if (hours !== null) {
      effects = [effectOf("hours_saved_per_staff_week", true)];
      hoursInputs = [si(ctx, "hours_saved_per_staff_week")];
      hoursFormula = "staff x hours saved per week x weeks x loaded rate";
    } else {
      const b = num(ctx, "minutes_per_task_before");
      const a = num(ctx, "minutes_per_task_after");
      const t = num(ctx, "tasks_per_staff_week");
      if (b === null || a === null || t === null) {
        if (b === null && a === null && t === null)
          missing.push("hours_saved_per_staff_week");
        else {
          if (b === null) missing.push("minutes_per_task_before");
          if (a === null) missing.push("minutes_per_task_after");
          if (t === null) missing.push("tasks_per_staff_week");
        }
      } else {
        hours = ((b - a) * t) / 60;
        effects = [
          effectOf("minutes_per_task_before", true),
          effectOf("minutes_per_task_after", true),
        ];
        hoursInputs = [
          si(ctx, "minutes_per_task_before"),
          si(ctx, "minutes_per_task_after"),
          si(ctx, "tasks_per_staff_week"),
        ];
        hoursFormula =
          "staff x (minutes before - minutes after) x tasks per week / 60 x weeks x loaded rate";
      }
    }
    const base = emptyDriver(id, missing);
    if (missing.length > 0 || hours === null) return base;
    const staff = num(ctx, "staff_affected") as number;
    const weeks = num(ctx, "weeks_per_year") as number;
    const rate = num(ctx, "loaded_hourly_cost") as number;
    const gross = staff * hours * weeks * rate;
    const recInput = ctx.byId.get("recapture_pct") as Input;
    const p = finish(
      {
        ...base,
        recapture_pct: num(ctx, "recapture_pct"),
        recapture_origin: srcType(recInput.origin),
        recapture_tier: recInput.tier === "user_unknown" ? null : recInput.tier,
      },
      effects,
      [
        si(ctx, "staff_affected"),
        ...hoursInputs,
        si(ctx, "weeks_per_year"),
        si(ctx, "loaded_hourly_cost"),
      ],
      hoursFormula,
      gross,
    );
    // documented cash reduction = the only hard savings
    const cash = num(ctx, "realized_as_cash");
    if (cash !== null && cash > 0) {
      const ce = effectOf("realized_as_cash");
      if (ce.tier === "measured" || ce.tier === "documented") {
        p.cash = ce;
        p.cash_amount = cash;
      } else {
        p.notes.push(
          "realized_as_cash is not documented, so it is not counted as hard savings.",
        );
      }
    }
    return p;
  }

  if (id === "data_quality") {
    let avoided: number | null = null;
    let effects: EffectEval[] = [];
    let inputs: StepInput[] = [];
    const cb = num(ctx, "error_count_before");
    const ca = num(ctx, "error_count_after");
    if (cb !== null && ca !== null) {
      avoided = cb - ca;
      effects = [effectOf("error_count_before"), effectOf("error_count_after")];
      inputs = [si(ctx, "error_count_before"), si(ctx, "error_count_after")];
    } else {
      const rb = num(ctx, "error_rate_before");
      const ra = num(ctx, "error_rate_after");
      const rec = num(ctx, "records_or_events_per_year");
      if (rb !== null && ra !== null && rec !== null) {
        avoided = ((rb - ra) / 100) * rec;
        effects = [effectOf("error_rate_before"), effectOf("error_rate_after")];
        inputs = [
          si(ctx, "records_or_events_per_year"),
          si(ctx, "error_rate_before"),
          si(ctx, "error_rate_after"),
        ];
      } else if (cb !== null || ca !== null) {
        if (cb === null) missing.push("error_count_before");
        if (ca === null) missing.push("error_count_after");
      } else if (rb !== null || ra !== null || rec !== null) {
        if (rb === null) missing.push("error_rate_before");
        if (ra === null) missing.push("error_rate_after");
        if (rec === null) missing.push("records_or_events_per_year");
      } else missing.push("error_count_before", "error_count_after");
    }
    let cpe = num(ctx, "cost_per_error");
    if (cpe !== null) {
      effects.push(effectOf("cost_per_error"));
      inputs.push(si(ctx, "cost_per_error"));
    } else {
      const unit = num(ctx, "cost_per_clean_unit");
      const mult = num(ctx, "error_cost_multiplier");
      if (unit !== null && mult !== null) {
        cpe = unit * (mult - 1);
        inputs.push(
          si(ctx, "cost_per_clean_unit"),
          si(ctx, "error_cost_multiplier"),
        );
      } else missing.push("cost_per_error");
    }
    const base = emptyDriver(id, missing);
    if (missing.length > 0 || avoided === null || cpe === null) return base;
    const cash = ctx.byId.get("cost_nature")?.value === "cash";
    const p = finish(
      base,
      effects,
      inputs,
      "(errors before - errors after) x cost per error",
      avoided * cpe,
    );
    p.label_class = cash ? "hard_savings" : "capacity_value";
    return p;
  }

  if (id === "decision_speed") {
    need(
      "decisions_per_year",
      "days_to_decide_before",
      "days_to_decide_after",
      "cost_of_delay_per_day",
    );
    const base = emptyDriver(id, missing);
    if (missing.length > 0) return base;
    const d = num(ctx, "decisions_per_year") as number;
    const db = num(ctx, "days_to_decide_before") as number;
    const da = num(ctx, "days_to_decide_after") as number;
    const cod = num(ctx, "cost_of_delay_per_day") as number;
    const effects = [
      effectOf("days_to_decide_before"),
      effectOf("days_to_decide_after"),
      effectOf("cost_of_delay_per_day"),
    ];
    const p = finish(
      base,
      effects,
      [
        si(ctx, "decisions_per_year"),
        si(ctx, "days_to_decide_before"),
        si(ctx, "days_to_decide_after"),
        si(ctx, "cost_of_delay_per_day"),
      ],
      "decisions x (days before - days after) x cost of delay per day",
      d * (db - da) * cod,
    );
    const basis = ctx.byId.get("cost_of_delay_basis")?.value;
    const cash = ctx.byId.get("cost_nature")?.value === "cash";
    p.label_class = cash
      ? "hard_savings"
      : basis === "revenue_deferred"
        ? "incremental_profit"
        : basis === "risk_exposure"
          ? "avoided_loss"
          : "capacity_value";
    return p;
  }

  // risk_reduction
  need("aro_before", "aro_after");
  let sle: number | null = num(ctx, "loss_per_event");
  const effects: EffectEval[] = [];
  const inputs: StepInput[] = [];
  if (sle !== null) {
    effects.push(effectOf("loss_per_event"));
    inputs.push(si(ctx, "loss_per_event"));
  } else {
    const av = num(ctx, "asset_value");
    const ex = num(ctx, "exposure_factor_pct");
    if (av !== null && ex !== null) {
      sle = (av * ex) / 100;
      effects.push(effectOf("asset_value"), effectOf("exposure_factor_pct"));
      inputs.push(si(ctx, "asset_value"), si(ctx, "exposure_factor_pct"));
    } else missing.push("loss_per_event");
  }
  const base = emptyDriver(id, missing);
  if (missing.length > 0 || sle === null) return base;
  const ab = num(ctx, "aro_before") as number;
  const aa = num(ctx, "aro_after") as number;
  effects.push(effectOf("aro_before"), effectOf("aro_after"));
  inputs.push(si(ctx, "aro_before"), si(ctx, "aro_after"));
  const p = finish(
    base,
    effects,
    inputs,
    "(ALE before - ALE after), ALE = events per year x loss per event",
    (ab - aa) * sle,
  );
  p.label_class =
    ctx.byId.get("cost_bearer")?.value === "customer"
      ? "customer_benefit"
      : "avoided_loss";
  return p;
}

// ---------- calculation ----------
function hOf(e: EffectEval, prm: Params): number {
  return prm.hmode === "computed"
    ? e.h
    : prm.hmode === "min"
      ? e.h_min
      : e.h_max;
}
function clampH(h: number, prm: Params): number {
  return Math.min(Math.max(h + prm.extra_haircut_pts / 100, 0), 0.99);
}
export function driverH(p: PreparedDriver, prm: Params): number {
  let h = 0;
  for (const e of p.effects) h = Math.max(h, hOf(e, prm));
  return clampH(h, prm);
}

/** Operating-year arrays (index 0 = first year of operation, before any delay). */
export function calcDriver(p: PreparedDriver, prm: Params): DriverCalc {
  const n = p.adoption.length;
  const h = driverH(p, prm);
  const gross: number[] = [];
  const adopted: number[] = [];
  const recaptured: number[] = [];
  const adjusted: number[] = [];
  const hard: number[] = [];
  const capacity: number[] = [];
  const R =
    p.recapture_pct === null
      ? 1
      : Math.min(Math.max(p.recapture_pct + prm.recapture_delta_pts, 0), 100) /
        100;
  const cashH = p.cash ? clampH(hOf(p.cash, prm), prm) : 0;
  for (let t = 0; t < n; t++) {
    const a = Math.min((p.adoption[t] ?? 0) * prm.adoption_mult, 1);
    const g = p.gross_annual;
    const ad = g * a;
    const rc = p.id === "time_savings" ? ad * R : ad;
    const adj = rc * (1 - h);
    gross.push(g);
    adopted.push(ad);
    recaptured.push(rc);
    adjusted.push(adj);
    if (p.label_class === "customer_benefit") {
      hard.push(0);
      capacity.push(0);
    } else if (p.label_class === "hard_savings") {
      hard.push(adj);
      capacity.push(0);
    } else if (p.cash) {
      const hv = p.cash_amount * (1 - cashH);
      hard.push(hv);
      capacity.push(Math.max(0, adj - hv));
    } else {
      hard.push(0);
      capacity.push(adj);
    }
  }
  return { gross, adopted, recaptured, adjusted, hard, capacity, haircut: h };
}

/** Rule of Ten helper: clean units cost `unit`, bad units cost `unit x multiplier`. */
export function ruleOfTenCost(
  cleanUnits: number,
  badUnits: number,
  unitCost: number,
  multiplier: number,
): number {
  return cleanUnits * unitCost + badUnits * unitCost * multiplier;
}

/** ALE = ARO x SLE. */
export function ale(aro: number, sle: number): number {
  return aro * sle;
}
