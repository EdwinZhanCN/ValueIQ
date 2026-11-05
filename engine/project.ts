// PROJECT LAYER: compute_project -> RunOutput (result or gap list, never both).
import {
  COST_ONE_TIME,
  COST_RECURRING,
  CATALOG,
  DRIVER_LABELS,
  DRIVER_ORDER,
  ESSENTIAL_COSTS,
} from "./catalog";
import { mergeConfig } from "./config";
import {
  BASE_PARAMS,
  calcDriver,
  prepareDriver,
  type DriverCalc,
  type Params,
  type PrepContext,
  type PreparedDriver,
} from "./drivers";
import {
  driverConfidence,
  gapOptions,
  releaseGate,
  TIER_ORDER,
  type EffectEval,
  type EvidenceCtx,
  type GateResult,
} from "./evidence";
import {
  financeSummary,
  pv,
  shiftBenefits,
  sum,
  upliftedCost,
} from "./finance";
import { assertJsonSafe, formatMoney, formatPct, round4 } from "./present";
import { BLOCKING_CODES, isUnknown, validateInputs } from "./validate";
import type {
  CashFlowRow,
  CostBasis,
  CostLine,
  Driver,
  DriverId,
  EngineConfig,
  FormFile,
  GapItem,
  GapList,
  Headline,
  Input,
  Meta,
  Payback,
  Result,
  RunOptions,
  RunOutput,
  ScenarioSummary,
  SensPoint,
  Step,
  Tier,
  Unquantified,
  ValidationIssue,
  Warning,
} from "./types";

export class EngineValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Invalid form: ${issues.map((i) => i.code).join(", ")}`);
    this.name = "EngineValidationError";
  }
}
export class EngineIntegrityError extends Error {
  constructor(public readonly failed: string[]) {
    super(`Integrity check failed: ${failed.join(", ")}`);
    this.name = "EngineIntegrityError";
  }
}

const NO_PAYBACK: Payback = {
  years: null,
  text: "No payback within the selected horizon",
};

function emptyTierCounts(): Record<Tier, number> {
  return {
    measured: 0,
    documented: 0,
    benchmark: 0,
    estimate: 0,
    assumption: 0,
  };
}
function countTiers(evals: readonly EffectEval[]): Record<Tier, number> {
  const c = emptyTierCounts();
  for (const e of evals) c[e.tier] += 1;
  return c;
}
function allEvals(p: PreparedDriver): EffectEval[] {
  return p.cash ? [...p.effects, p.cash] : p.effects;
}

interface CostsBuilt {
  lines: (CostLine & { kind: "one_time" | "annual" })[];
  c0: number;
  annual: number; // per-year recurring cost, uplifted
  notes: Warning[];
  missingEssential: string[];
}

function buildCosts(
  byId: Map<string, Input>,
  cfg: EngineConfig,
  prefix: string,
): CostsBuilt {
  const override = byId.get("cost_uplift_pct");
  const overridePct =
    !isUnknown(override) && typeof override?.value === "number"
      ? override.value
      : null;
  const lines: CostsBuilt["lines"] = [];
  const notes: Warning[] = [];
  const missingEssential: string[] = [];
  let n = 0;
  const add = (id: string, kind: "one_time" | "annual") => {
    const inp = byId.get(id);
    if (isUnknown(inp) || typeof inp?.value !== "number") {
      if ((ESSENTIAL_COSTS as readonly string[]).includes(id))
        missingEssential.push(id);
      else if (inp)
        notes.push({
          code: "OPTIONAL_COST_UNKNOWN",
          message: `${CATALOG[id]?.label ?? id} is unknown and is not included in costs.`,
          refs: [],
        });
      return;
    }
    const basis: CostBasis = inp.basis ?? "assumed";
    const u = upliftedCost(inp.value, basis, cfg.cost_uplift_pct, overridePct);
    n += 1;
    lines.push({
      id,
      label: CATALOG[id]?.label ?? id,
      base: inp.value,
      basis,
      uplift_pct: u.uplift_pct,
      adjusted: u.adjusted,
      ref: `${prefix}${n}`,
      kind,
    });
  };
  for (const id of COST_ONE_TIME) add(id, "one_time");
  for (const id of COST_RECURRING) add(id, "annual");
  // essential ids that are not in the loops above are covered; ensure absent ones are flagged
  for (const id of ESSENTIAL_COSTS)
    if (!missingEssential.includes(id) && !lines.some((l) => l.id === id))
      missingEssential.push(id);
  const c0 = sum(
    lines.filter((l) => l.kind === "one_time").map((l) => l.adjusted),
  );
  const annual = sum(
    lines.filter((l) => l.kind === "annual").map((l) => l.adjusted),
  );
  return { lines, c0, annual, notes, missingEssential };
}

interface Streams {
  hard: number[];
  cap: number[];
  calcs: Map<DriverId, DriverCalc>;
  shifted: Map<DriverId, { hard: number[]; cap: number[] }>;
}

function streamsFor(
  drivers: readonly PreparedDriver[],
  prm: Params,
  delayMonths: number,
  horizon: number,
): Streams {
  const hard = new Array<number>(horizon).fill(0);
  const cap = new Array<number>(horizon).fill(0);
  const calcs = new Map<DriverId, DriverCalc>();
  const shifted = new Map<DriverId, { hard: number[]; cap: number[] }>();
  for (const p of drivers) {
    const c = calcDriver(p, prm);
    calcs.set(p.id, c);
    const sh = shiftBenefits(c.hard, delayMonths);
    const sc = shiftBenefits(c.capacity, delayMonths);
    shifted.set(p.id, { hard: sh, cap: sc });
    for (let t = 0; t < horizon; t++) {
      hard[t] = (hard[t] ?? 0) + (sh[t] ?? 0);
      cap[t] = (cap[t] ?? 0) + (sc[t] ?? 0);
    }
  }
  return { hard, cap, calcs, shifted };
}

function fmtList(refs: string[]): string {
  return refs.length ? ` [${refs.join(", ")}]` : "";
}

/** Letters A, B, C... */
function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

export function computeProject(form: FormFile, opts: RunOptions): RunOutput {
  const cfg = mergeConfig(opts.config);
  const report = validateInputs(form);
  const fatal = report.errors.filter((e) => !BLOCKING_CODES.includes(e.code));
  if (fatal.length > 0) throw new EngineValidationError(fatal);

  const byId = new Map<string, Input>();
  for (const i of form.inputs) byId.set(i.id, i);
  const scalar = (id: string): number | string => {
    const top = (form as unknown as Record<string, unknown>)[id];
    if (typeof top === "number" || typeof top === "string") return top;
    const v = byId.get(id)?.value;
    return typeof v === "number" || typeof v === "string" ? v : "";
  };
  const horizon = scalar("horizon_years") as number;
  const rate = scalar("discount_rate_pct") as number;
  const currency = String(scalar("currency"));
  const generated = new Date(opts.generated_at);
  const evCtx: EvidenceCtx = {
    cfg,
    known_file_ids: new Set(Object.keys(form.file_descriptions ?? {})),
    now: generated,
  };
  const ctx: PrepContext = { ...evCtx, byId, horizon };

  const goals = DRIVER_ORDER.filter((d) => form.goals.includes(d));
  const letters = new Map<DriverId, string>();
  goals.forEach((g, i) => letters.set(g, letter(i)));
  const prepared = goals.map((g) => prepareDriver(g, ctx));
  const quantified = prepared.filter((p) => p.status === "ok");
  const costsBuilt = buildCosts(byId, cfg, letter(goals.length));
  const delayInput = byId.get("delay_months");
  const delay =
    !isUnknown(delayInput) && typeof delayInput?.value === "number"
      ? delayInput.value
      : 0;

  const meta: Meta = {
    run_id: opts.run_id,
    mode: opts.mode ?? "real",
    label: "Pre-funding estimate",
    currency,
    horizon_years: horizon,
    discount_rate_pct: rate,
    scenario: "expected",
    tier_counts: countTiers(quantified.flatMap(allEvals)),
    contract_version: cfg.versions.contract,
    formula_version: cfg.versions.formula,
    settings_version: cfg.versions.settings,
    generated_at: opts.generated_at,
  };

  // ---- expected scenario and the gate ----
  const expected = streamsFor(quantified, BASE_PARAMS, delay, horizon);
  const gateDrivers = quantified.map((p) => {
    const c = expected.calcs.get(p.id) as DriverCalc;
    return {
      id: p.id,
      total: sum(c.adjusted),
      confidence: driverConfidence(p.effects.concat(p.cash ? [p.cash] : [])),
    };
  });
  const gate = releaseGate(gateDrivers, cfg);

  if (costsBuilt.missingEssential.length > 0 || !gate.released) {
    const out: RunOutput = {
      kind: "gap_list",
      meta,
      gap_list: buildGapList(
        prepared,
        quantified,
        gate,
        costsBuilt,
        cfg,
        letters,
      ),
    };
    assertJsonSafe(out);
    return out;
  }

  // ---- released: build the result ----
  const included = quantified.filter((p) => gate.included.includes(p.id));
  meta.tier_counts = countTiers(included.flatMap(allEvals));
  const streams = streamsFor(included, BASE_PARAMS, delay, horizon);
  const { c0, annual } = costsBuilt;
  const annualFlows = new Array<number>(horizon).fill(annual);
  const both = streams.hard.map((h, t) => h + (streams.cap[t] ?? 0));
  const hasHard = sum(streams.hard) > 0;
  const finAll = financeSummary({
    c0,
    benefits: both,
    costs: annualFlows,
    rate_pct: rate,
  });
  const finHard = hasHard
    ? financeSummary({
        c0,
        benefits: streams.hard,
        costs: annualFlows,
        rate_pct: rate,
      })
    : null;

  const nullReasons: Record<string, string> = {};
  if (!finHard) {
    for (const k of ["npv.hard", "roi.undiscounted.hard", "roi.pv.hard"])
      nullReasons[k] = "No documented cash reduction";
  }
  if (finAll.roi_pv_pct === null) {
    nullReasons["roi.undiscounted.capacity_inclusive"] =
      "Total cost is zero, so ROI is undefined (see net benefit)";
    nullReasons["roi.pv.capacity_inclusive"] =
      "Total cost is zero, so ROI is undefined (see net benefit)";
    if (finHard) {
      nullReasons["roi.undiscounted.hard"] =
        "Total cost is zero, so ROI is undefined (see net benefit)";
      nullReasons["roi.pv.hard"] =
        "Total cost is zero, so ROI is undefined (see net benefit)";
    }
  }
  const headline: Headline = {
    npv: { hard: finHard ? finHard.npv : null, capacity_inclusive: finAll.npv },
    roi: {
      undiscounted: {
        hard: finHard ? finHard.roi_undiscounted_pct : null,
        capacity_inclusive: finAll.roi_undiscounted_pct,
      },
      pv: {
        hard: finHard ? finHard.roi_pv_pct : null,
        capacity_inclusive: finAll.roi_pv_pct,
      },
    },
    payback: {
      hard: finHard ? finHard.payback : NO_PAYBACK,
      capacity_inclusive: finAll.payback,
    },
    benefits_pv: finAll.pv_benefits,
    costs_pv: finAll.pv_costs,
    null_reasons: nullReasons,
  };

  // ---- drivers with steps ----
  const cashDrivers = included.filter(
    (p) => p.label_class !== "customer_benefit",
  );
  const totalBenefit = sum(both);
  const drivers: Driver[] = included.map((p) => {
    const calc = streams.calcs.get(p.id) as DriverCalc;
    const sh = streams.shifted.get(p.id) as { hard: number[]; cap: number[] };
    const post = sh.hard.map((h, t) => h + (sh.cap[t] ?? 0));
    const lt = letters.get(p.id) as string;
    const steps: Step[] = [];
    const push = (
      name: string,
      label: string,
      formula: string,
      byYear: number[],
      source: Step["source_type"],
      tier: Tier | null,
      inputs: Step["inputs"] = [],
    ) =>
      steps.push({
        ref: `${lt}${steps.length + 1}`,
        order: steps.length + 1,
        name,
        label,
        formula,
        inputs,
        source_type: source,
        by_year: byYear,
        value: sum(byYear),
        evidence_tier: tier,
      });
    const weakestTier = (() => {
      let w: EffectEval | undefined;
      for (const e of p.effects) if (!w || e.h > w.h) w = e;
      return w ? w.tier : null;
    })();
    push(
      "gross",
      "Gross annual value",
      p.gross_formula,
      calc.gross,
      p.source_type,
      weakestTier,
      p.gross_inputs,
    );
    push(
      "adoption",
      `After adoption (${p.adoption.map((a) => `${Math.round(a * 1000) / 10}%`).join(" / ")})`,
      "gross x adoption by year",
      calc.adopted,
      "calculated",
      null,
      [
        {
          id: "adoption_by_year",
          label: CATALOG["adoption_by_year"]?.label ?? "",
          value: p.adoption.map((a) => a * 100).join(" / "),
        },
      ],
    );
    if (p.id === "time_savings") {
      push(
        "recapture",
        "After recapture (capacity value only)",
        `after adoption x recapture ${p.recapture_pct ?? ""}%`,
        calc.recaptured,
        p.recapture_origin,
        p.recapture_tier,
        [
          {
            id: "recapture_pct",
            label: CATALOG["recapture_pct"]?.label ?? "",
            value: p.recapture_pct ?? "",
          },
        ],
      );
    }
    push(
      "haircut",
      `After evidence haircut (${(calc.haircut * 100).toFixed(1)}%)`,
      "previous step x (1 - haircut); haircut = weakest link over the effect inputs",
      calc.adjusted,
      "calculated",
      null,
      p.effects.map((e) => ({
        id: e.id,
        label: `${CATALOG[e.id]?.label ?? e.id} haircut %`,
        value: e.h * 100,
      })),
    );
    if (p.cash) {
      push(
        "hard_cash",
        "Documented cash reduction (hard savings)",
        "realized cash x (1 - haircut of that input); capacity value is net of it",
        calc.hard,
        "user",
        p.cash.tier,
        [
          {
            id: "realized_as_cash",
            label: CATALOG["realized_as_cash"]?.label ?? "",
            value: p.cash_amount,
          },
        ],
      );
    }
    if (delay > 0 || p.cash) {
      push(
        "adjusted",
        delay > 0
          ? `Adjusted benefit after a ${delay}-month delay`
          : "Adjusted benefit",
        "hard + capacity value by project year",
        post,
        "calculated",
        null,
      );
    }
    const tc = countTiers(allEvals(p));
    const plan = form.measurement_plan?.[p.id];
    const total = sum(post);
    return {
      id: p.id,
      label_class: p.label_class,
      label: p.label,
      included: true,
      steps,
      annual: post.map((b, t) => ({ year: t + 1, benefit: b })),
      haircut_pct: calc.haircut * 100,
      confidence: round4(
        gateDrivers.find((g) => g.id === p.id)?.confidence ?? 1 - calc.haircut,
      ),
      tier_counts: tc,
      total,
      pv: pv(post, rate),
      share_of_benefit:
        p.label_class === "customer_benefit" || totalBenefit <= 0
          ? 0
          : total / totalBenefit,
      measured_by:
        plan?.metric ??
        "Not specified: define a before/after measure for this driver",
      risk_factors: riskFactors(p),
    };
  });

  // ---- cash flows ----
  const cash_flows: CashFlowRow[] = [
    {
      year: 0,
      benefits_hard: 0,
      benefits_capacity: 0,
      costs: c0,
      net: -c0,
      cumulative: -c0,
    },
  ];
  let cum = -c0;
  for (let t = 0; t < horizon; t++) {
    const net = (both[t] ?? 0) - annual;
    cum += net;
    cash_flows.push({
      year: t + 1,
      benefits_hard: streams.hard[t] ?? 0,
      benefits_capacity: streams.cap[t] ?? 0,
      costs: annual,
      net,
      cumulative: cum,
    });
  }

  // ---- scenarios and sensitivity ----
  const summarize = (
    prm: Params,
    ratePct = rate,
  ): {
    s: Streams;
    npvH: number | null;
    npvC: number;
    roiPv: number | null;
  } => {
    const s = streamsFor(included, prm, delay, horizon);
    const b2 = s.hard.map((h, t) => h + (s.cap[t] ?? 0));
    const f = financeSummary({
      c0,
      benefits: b2,
      costs: annualFlows,
      rate_pct: ratePct,
    });
    const h =
      sum(s.hard) > 0
        ? financeSummary({
            c0,
            benefits: s.hard,
            costs: annualFlows,
            rate_pct: ratePct,
          }).npv
        : null;
    return { s, npvH: h, npvC: f.npv, roiPv: f.roi_pv_pct };
  };
  const scen = (prm: Params, what: string): ScenarioSummary => {
    const r = summarize(prm);
    return {
      npv_hard: r.npvH,
      npv_capacity_inclusive: r.npvC,
      roi_pv_capacity_inclusive: r.roiPv,
      what_moved: what,
    };
  };
  const sc = cfg.scenario;
  const scenarios = {
    conservative: scen(
      {
        adoption_mult: sc.adoption_mult.conservative,
        recapture_delta_pts: sc.recapture_delta_pts.conservative,
        hmode: "max",
        extra_haircut_pts: 0,
      },
      `Haircuts at the top of each band, adoption x${sc.adoption_mult.conservative}, recapture ${sc.recapture_delta_pts.conservative} points`,
    ),
    expected: scen(
      BASE_PARAMS,
      "Headline scenario: stated inputs and computed haircuts",
    ),
    optimistic: scen(
      {
        adoption_mult: sc.adoption_mult.optimistic,
        recapture_delta_pts: sc.recapture_delta_pts.optimistic,
        hmode: "min",
        extra_haircut_pts: 0,
      },
      `Haircuts at the bottom of each band, adoption x${sc.adoption_mult.optimistic} (capped at 100%), recapture +${sc.recapture_delta_pts.optimistic} points`,
    ),
  };
  const sens = (
    xs: number[],
    f: (x: number) => ReturnType<typeof summarize>,
  ): SensPoint[] =>
    xs.map((x) => {
      const r = f(x);
      return { x, npv_hard: r.npvH, npv_capacity_inclusive: r.npvC };
    });
  const sensRate = sens(cfg.sensitivity.discount_rates_pct, (x) =>
    summarize(BASE_PARAMS, x),
  );
  const sensitivity = {
    x_labels: {
      discount_rate: "Discount rate (%)",
      adoption: "Adoption multiplier",
      haircut: "Extra haircut (percentage points)",
    },
    discount_rate: sensRate,
    adoption: sens(cfg.sensitivity.adoption_mults, (x) =>
      summarize({ ...BASE_PARAMS, adoption_mult: x }),
    ),
    haircut: sens(cfg.sensitivity.extra_haircut_pts, (x) =>
      summarize({ ...BASE_PARAMS, extra_haircut_pts: x }),
    ),
  };

  // ---- charts ----
  const sumStage = (pick: (c: DriverCalc) => number[]) =>
    sum(
      cashDrivers.map((p) => sum(pick(streams.calcs.get(p.id) as DriverCalc))),
    );
  const waterfall = [
    { label: "Gross value", value: sumStage((c) => c.gross) },
    { label: "After adoption", value: sumStage((c) => c.adopted) },
    { label: "After recapture", value: sumStage((c) => c.recaptured) },
    { label: "After evidence haircut", value: sumStage((c) => c.adjusted) },
  ];
  if (delay > 0 || cashDrivers.some((p) => p.cash)) {
    waterfall.push({
      label: "Adjusted benefit (after delay and cash netting)",
      value: totalBenefit,
    });
  }
  const charts = {
    waterfall,
    driver_contribution: drivers
      .filter((d) => d.label_class !== "customer_benefit")
      .map((d) => ({ driver: d.id, value: d.total })),
    sensitivity: sensRate,
  };

  // ---- warnings ----
  const warnings: Warning[] = [...costsBuilt.notes];
  for (const p of included)
    for (const n of p.notes)
      warnings.push({
        code: "EVIDENCE_NOTE",
        message: n,
        refs: [`${letters.get(p.id)}1`],
      });
  const gw = cfg.guardrails;
  const shareOf = (pred: (p: PreparedDriver) => boolean) =>
    totalBenefit > 0
      ? sum(
          drivers
            .filter(
              (d) =>
                d.label_class !== "customer_benefit" &&
                pred(included.find((p) => p.id === d.id) as PreparedDriver),
            )
            .map((d) => d.total),
        ) / totalBenefit
      : 0;
  for (const d of drivers) {
    if (d.share_of_benefit > gw.driver_share) {
      warnings.push({
        code: "DRIVER_CONCENTRATION",
        message: `${d.label} is ${formatPct(d.share_of_benefit * 100)} of total benefit (guardrail: over ${gw.driver_share * 100}%). Check it carefully.`,
        refs: [d.steps[0]?.ref ?? ""],
      });
    }
  }
  if (
    shareOf((p) => p.effects.some((e) => e.vendor_supplied)) > gw.vendor_share
  ) {
    warnings.push({
      code: "VENDOR_CONCENTRATION",
      message: `More than ${gw.vendor_share * 100}% of benefit rests on vendor-supplied numbers.`,
      refs: drivers
        .filter((d) =>
          included
            .find((p) => p.id === d.id)
            ?.effects.some((e) => e.vendor_supplied),
        )
        .map((d) => d.steps[0]?.ref ?? ""),
    });
  }
  if (
    included.some((p) => p.id === "time_savings") &&
    included.some((p) => p.id === "data_quality") &&
    Array.isArray(byId.get("cost_sources")?.value) &&
    (byId.get("cost_sources")?.value as string[]).includes("rework")
  ) {
    warnings.push({
      code: "DOUBLE_COUNT",
      message:
        "Rework hours may be counted in both time savings and data quality. Confirm which one counts.",
      refs: [
        `${letters.get("time_savings")}1`,
        `${letters.get("data_quality")}1`,
      ],
    });
  }
  const lo = summarize(
    BASE_PARAMS,
    Math.max(0, rate - gw.npv_flip_points),
  ).npvC;
  const hi = summarize(
    BASE_PARAMS,
    Math.min(100, rate + gw.npv_flip_points),
  ).npvC;
  if (finAll.npv > 0 !== lo > 0 || finAll.npv > 0 !== hi > 0) {
    warnings.push({
      code: "NPV_SIGN_FLIP",
      message: `NPV changes sign within ${gw.npv_flip_points} points of the discount rate.`,
      refs: [],
    });
  }
  if (
    shareOf((p) => p.effects.some((e) => e.tier === "assumption")) >
    gw.assumption_share
  ) {
    warnings.push({
      code: "ASSUMPTION_CONCENTRATION",
      message: `More than ${gw.assumption_share * 100}% of benefit comes from assumption-tier inputs.`,
      refs: drivers
        .filter((d) =>
          included
            .find((p) => p.id === d.id)
            ?.effects.some((e) => e.tier === "assumption"),
        )
        .map((d) => d.steps[0]?.ref ?? ""),
    });
  }

  // ---- unquantified ----
  const unquantified: Unquantified[] = [];
  for (const p of prepared) {
    if (p.status === "unquantified") {
      unquantified.push({
        target: p.id,
        reason: `Missing or unknown inputs: ${p.missing.join(", ")}`,
        raise_with: `Provide ${CATALOG[p.missing[0] ?? ""]?.label ?? p.missing[0] ?? "the missing input"}`,
      });
    } else if (!included.includes(p)) {
      const dr = gate.dropped.find((d) => d.id === p.id);
      const best = gapFor(p, cfg)[0];
      unquantified.push({
        target: p.id,
        reason: `Evidence confidence ${formatPct((dr?.confidence ?? 0) * 100)} is below the floor of ${formatPct((dr?.floor ?? 0) * 100)}`,
        raise_with: best ? best.what_to_add : "Add stronger evidence",
      });
    }
  }

  for (const g of DRIVER_ORDER) {
    if (!goals.includes(g)) {
      unquantified.push({
        target: g,
        reason: "Not selected as a goal for this project",
        raise_with: `Add the ${DRIVER_LABELS[g].toLowerCase()} goal and the inputs it needs`,
      });
    }
  }

  // ---- confidence ledger ----
  const ledgerDrivers = quantified.map((p) => ({
    id: p.id,
    confidence: round4(gateDrivers.find((g) => g.id === p.id)?.confidence ?? 0),
    floor: cfg.driver_floors[p.id],
    included: included.includes(p),
  }));
  const reconcileDrivers = sum(
    drivers
      .filter((d) => d.label_class !== "customer_benefit")
      .map((d) => d.total),
  );
  const reconcileFlows = sum(
    cash_flows.map((r) => r.benefits_hard + r.benefits_capacity),
  );
  const npvFromRows = cash_flows.reduce(
    (s, r) => s + r.net / Math.pow(1 + rate / 100, r.year),
    0,
  );
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const chartOk =
    close(sum(charts.driver_contribution.map((c) => c.value)), totalBenefit) &&
    close(
      waterfall[3]?.value ?? 0,
      sumStage((c) => c.adjusted),
    );
  const checks = [
    { name: "bounds", passed: report.errors.length === 0 },
    {
      name: "versions recorded",
      passed: Boolean(
        meta.formula_version && meta.settings_version && meta.contract_version,
      ),
    },
    {
      name: "every number traces to a step",
      passed:
        drivers.every((d) => d.steps.every((s) => s.ref.length > 0)) &&
        costsBuilt.lines.every((l) => l.ref.length > 0),
    },
    {
      name: "driver totals reconcile to benefit total",
      passed: close(reconcileDrivers, reconcileFlows) && chartOk,
    },
    {
      name: "cash flows reproduce NPV",
      passed: close(npvFromRows, finAll.npv),
    },
    { name: "no unresolved double count", passed: true },
    {
      name: "no missing essential cost",
      passed: costsBuilt.missingEssential.length === 0,
    },
  ];
  const failedChecks = checks.filter((c) => !c.passed).map((c) => c.name);
  if (failedChecks.length > 0) throw new EngineIntegrityError(failedChecks);

  const tcText = TIER_ORDER.filter((t) => meta.tier_counts[t] > 0)
    .map((t) => `${meta.tier_counts[t]} ${t}`)
    .join(", ");
  const band_note = `${tcText || "No"} inputs. Effective haircuts: ${drivers
    .map((d) => `${d.label.toLowerCase()} ${d.haircut_pct.toFixed(1)}%`)
    .join(", ")}.`;

  // ---- narrative: every number cites a step ref ----
  const costRefs = costsBuilt.lines.map((l) => l.ref);
  const hardRefs = drivers
    .filter(
      (d) =>
        d.label_class === "hard_savings" ||
        d.steps.some((s) => s.name === "hard_cash"),
    )
    .map(
      (d) =>
        (
          d.steps.find((s) => s.name === "hard_cash") ??
          d.steps[d.steps.length - 1]
        )?.ref ?? "",
    );
  const summaryText =
    `Over ${horizon} years this project is estimated to return a capacity-inclusive NPV of ${formatMoney(finAll.npv, currency)} on costs with a present value of ${formatMoney(finAll.pv_costs, currency)}${fmtList(costRefs)}. ` +
    (finHard
      ? `Hard savings alone give an NPV of ${formatMoney(finHard.npv, currency)}${fmtList(hardRefs)}. `
      : "No documented cash reduction is included, so there is no hard-savings NPV. ") +
    "Treat this as a pre-funding estimate.";
  const by_driver: Partial<Record<DriverId, string>> = {};
  for (const d of drivers) {
    const last = d.steps[d.steps.length - 1]?.ref ?? "";
    by_driver[d.id] =
      `${d.label} contributes ${formatMoney(d.total, currency)} over the horizon after the evidence haircut${fmtList([last])}.`;
  }

  const SETTINGS = ["horizon_years", "discount_rate_pct", "currency"];
  const orderKey = (id: string) => {
    const idx = Object.keys(CATALOG).indexOf(id);
    return (SETTINGS.includes(id) ? 1000 : 0) + (idx < 0 ? 999 : idx);
  };
  const proxies_used = [...form.inputs]
    .sort((a, b) => orderKey(a.id) - orderKey(b.id))
    .filter(
      (i) =>
        (i.origin === "default" || i.origin === "proxy_accepted") &&
        i.value !== null &&
        i.tier !== "user_unknown",
    )
    .map((i) => ({
      input_id: i.id,
      value: Array.isArray(i.value)
        ? i.value.join(" / ")
        : typeof i.value === "boolean"
          ? String(i.value)
          : (i.value as number | string),
      source: i.note ?? i.origin ?? "default",
      tier: i.tier as Tier,
    }));

  const measurement_plan: Result["measurement_plan"] = {};
  for (const d of drivers) {
    measurement_plan[d.id] = form.measurement_plan?.[d.id] ?? {
      metric: "Not specified",
      baseline: "Not specified",
      baseline_source: "Not specified",
      owner: "Not specified",
      frequency: "Not specified",
    };
  }

  const baseline = byId.get("baseline_alternative");
  const result: Result = {
    headline,
    drivers,
    costs: {
      lines: costsBuilt.lines.map(({ kind: _k, ...l }) => l),
      total_pv: finAll.pv_costs,
      delay_months: delay,
    },
    cash_flows,
    scenarios,
    sensitivity,
    charts,
    confidence: {
      integrity: { passed: true, checks },
      drivers: ledgerDrivers,
      project: {
        confidence: round4(gate.project_confidence),
        floor: cfg.project_floor,
        ...(gate.capped_by ? { capped_by: gate.capped_by } : {}),
      },
      band_note,
    },
    narrative: { summary: summaryText, by_driver },
    unquantified,
    flexibility: [],
    doing_nothing_risks: [
      typeof baseline?.value === "string" && baseline.value.length > 0
        ? baseline.value
        : "Today's costs and exposure continue unchanged (no baseline alternative was entered).",
    ],
    proceeding_risks: [
      ...costsBuilt.lines
        .filter((l) => l.basis !== "quoted")
        .map(
          (l) =>
            `${l.label} is ${l.basis}, so a ${l.uplift_pct}% uplift was applied [${l.ref}].`,
        ),
      "Adoption may ramp more slowly than the stated path.",
    ],
    measurement_plan,
    proxies_used,
    overrides: [],
    warnings,
  };

  const out: RunOutput = { kind: "result", meta, result };
  assertJsonSafe(out);
  return out;
}

function riskFactors(p: PreparedDriver): string[] {
  const out: string[] = [];
  for (const e of p.effects) {
    if (
      e.tier === "estimate" ||
      e.tier === "assumption" ||
      e.tier === "benchmark"
    )
      out.push(
        `${CATALOG[e.id]?.label ?? e.id} rests on ${e.tier}-tier evidence.`,
      );
  }
  if (p.id === "time_savings")
    out.push("Freed time may not be turned into other work (recapture).");
  out.push("Adoption depends on training and rollout.");
  return out;
}

/** Improvement options for a driver, best first. */
function gapFor(p: PreparedDriver, cfg: EngineConfig): GapItem[] {
  const evals = allEvals(p);
  const now = driverConfidence(evals);
  const items: GapItem[] = [];
  for (const e of evals) {
    const others = evals.filter((o) => o !== e).map((o) => o.c);
    const minOthers = others.length ? Math.min(...others) : 1;
    for (const o of gapOptions(e, cfg)) {
      const after = Math.min(o.new_c, minOthers);
      if (after > now + 1e-12) {
        items.push({
          rank: 0,
          target: e.id,
          label: CATALOG[e.id]?.label ?? e.id,
          what_to_add: o.what_to_add,
          confidence_now: round4(now),
          confidence_if_added: round4(after),
          return_to: { screen: "intake", input_id: e.id },
        });
      }
    }
  }
  if (items.length === 0) {
    // weakest inputs tie: show the best option for the first weakest input
    const w = evals.find((e) => e.c === now);
    if (w) {
      const o = gapOptions(w, cfg)[0];
      if (o)
        items.push({
          rank: 0,
          target: w.id,
          label: CATALOG[w.id]?.label ?? w.id,
          what_to_add: `${o.what_to_add} (together with the other inputs at the same level)`,
          confidence_now: round4(now),
          confidence_if_added: round4(o.new_c),
          return_to: { screen: "intake", input_id: w.id },
        });
    }
  }
  return items.sort((a, b) => b.confidence_if_added - a.confidence_if_added);
}

function buildGapList(
  prepared: PreparedDriver[],
  quantified: PreparedDriver[],
  gate: GateResult,
  costs: CostsBuilt,
  cfg: EngineConfig,
  _letters: Map<DriverId, string>,
): GapList {
  const items: GapItem[] = [];
  const unknownIf = 1 - cfg.bands.documented[1]; // a documented source with no extra backing
  for (const id of costs.missingEssential) {
    items.push({
      rank: 0,
      target: id,
      label: CATALOG[id]?.label ?? id,
      what_to_add: `Provide ${CATALOG[id]?.label ?? id} (an essential cost; without it no result is given)`,
      confidence_now: 0,
      confidence_if_added: unknownIf,
      return_to: { screen: "intake", input_id: id },
    });
  }
  for (const p of prepared) {
    if (p.status === "unquantified") {
      for (const m of p.missing) {
        items.push({
          rank: 0,
          target: m,
          label: CATALOG[m]?.label ?? m,
          what_to_add: `Provide ${CATALOG[m]?.label ?? m} for ${DRIVER_LABELS[p.id].toLowerCase()}`,
          confidence_now: 0,
          confidence_if_added: unknownIf,
          return_to: { screen: "intake", input_id: m },
        });
      }
    }
  }
  const candidates = quantified.filter(
    (p) =>
      gate.dropped.some((d) => d.id === p.id) ||
      (!gate.released && gate.included.includes(p.id)),
  );
  for (const p of candidates) items.push(...gapFor(p, cfg));
  // stable ranking: higher confidence_if_added first, then input id
  const seen = new Set<string>();
  const ranked = items
    .sort(
      (a, b) =>
        b.confidence_if_added - a.confidence_if_added ||
        a.target.localeCompare(b.target),
    )
    .filter((i) => {
      const k = `${i.target}|${i.what_to_add}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((i, k) => ({ ...i, rank: k + 1 }));
  return {
    reason:
      costs.missingEssential.length > 0
        ? "An essential cost is missing, so no result can be given"
        : "Not enough backed evidence to give a result",
    project_confidence:
      costs.missingEssential.length > 0 && quantified.length === 0
        ? 0
        : round4(gate.project_confidence),
    project_floor: cfg.project_floor,
    items: ranked,
    dropped_drivers: gate.dropped.map((d) => ({
      ...d,
      confidence: round4(d.confidence),
    })),
  };
}
