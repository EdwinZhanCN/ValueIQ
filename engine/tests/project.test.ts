import { describe, expect, it } from "vitest";
import { scanNarrative, findUncitedNumbers, collectRefs } from "../narrative";
import { computeProject } from "../project";
import { checkRunOutput } from "../schema";
import { sum } from "../finance";
import type { LegacyFormFile, Input, Result, RunOutput } from "../types";
import { genForm, genStrongForm } from "./gen";
import {
  OPTS,
  backing,
  cost,
  goldenResultForm,
  inp,
  simpleForm,
} from "./forms";
import { rng } from "./rng";

const run = (
  f: LegacyFormFile,
  config?: Parameters<typeof computeProject>[1]["config"],
): RunOutput => computeProject(f, { ...OPTS, ...(config ? { config } : {}) });
const relaxed = {
  driver_floors: {
    time_savings: 0,
    data_quality: 0,
    decision_speed: 0,
    risk_reduction: 0,
  },
  project_floor: 0,
};

function independentChecks(out: RunOutput): string[] {
  const bad: string[] = [];
  if (out.kind !== "result") return bad;
  const r = out.result as Result;
  const rate = out.meta.discount_rate_pct;
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
  const real = r.drivers.filter((d) => d.label_class !== "customer_benefit");
  const benefit = sum(
    r.cash_flows.map((c) => c.benefits_hard + c.benefits_capacity),
  );
  if (!close(sum(real.map((d) => d.total)), benefit))
    bad.push("driver totals != benefit total");
  if (!close(sum(r.charts.driver_contribution.map((c) => c.value)), benefit))
    bad.push("chart contribution != benefit");
  if (!close(sum(real.map((d) => d.share_of_benefit)), benefit > 0 ? 1 : 0))
    bad.push("shares do not sum to 1");
  // independent NPV from the rows
  const npv = r.cash_flows.reduce(
    (s, c) => s + c.net / Math.pow(1 + rate / 100, c.year),
    0,
  );
  if (!close(npv, r.headline.npv.capacity_inclusive as number))
    bad.push("rows != NPV");
  // costs PV
  const pvc = r.cash_flows.reduce(
    (s, c) => s + c.costs / Math.pow(1 + rate / 100, c.year),
    0,
  );
  if (!close(pvc, r.headline.costs_pv as number)) bad.push("cost PV mismatch");
  if (!close(r.costs.total_pv, pvc)) bad.push("costs.total_pv mismatch");
  // cumulative
  let cum = 0;
  for (const c of r.cash_flows) {
    cum += c.net;
    if (!close(cum, c.cumulative)) bad.push(`cumulative wrong at ${c.year}`);
  }
  const w = r.charts.waterfall;
  for (let i = 1; i < 4; i++)
    if ((w[i]?.value ?? 0) > (w[i - 1]?.value ?? 0) + 1e-6 && i !== 2)
      bad.push("waterfall rises");
  return bad;
}

describe("K4 determinism", () => {
  it("1,000 repeats give byte-identical output", () => {
    const f = goldenResultForm();
    const first = JSON.stringify(run(f));
    for (let i = 0; i < 1000; i++) expect(JSON.stringify(run(f))).toBe(first);
  });
  it("shuffled input order gives byte-identical output (200 shuffles, all-driver form)", () => {
    const f = genStrongForm(11);
    const base = JSON.stringify(run(f));
    const r = rng(4);
    for (let k = 0; k < 200; k++) {
      const inputs = [...f.inputs];
      for (let i = inputs.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [inputs[i], inputs[j]] = [inputs[j] as Input, inputs[i] as Input];
      }
      expect(JSON.stringify(run({ ...f, inputs }))).toBe(base);
    }
    const g = goldenResultForm();
    const gb = JSON.stringify(run(g));
    expect(JSON.stringify(run({ ...g, inputs: [...g.inputs].reverse() }))).toBe(
      gb,
    );
  });
  it("the engine does not mutate its input", () => {
    const f = goldenResultForm();
    const before = JSON.stringify(f);
    run(f);
    expect(JSON.stringify(f)).toBe(before);
  });
});

describe("K5 reconciliation over 10,000 seeded generated forms", () => {
  it("0 violations (replay any failure with its seed)", () => {
    let results = 0;
    let gaps = 0;
    const failures: string[] = [];
    for (let seed = 1; seed <= 10000; seed++) {
      const form = seed % 2 === 0 ? genStrongForm(seed) : genForm(seed);
      let out: RunOutput;
      try {
        out = run(form);
      } catch (e) {
        failures.push(`seed ${seed}: threw ${(e as Error).message}`);
        continue;
      }
      if (out.kind === "result") results++;
      else gaps++;
      const bad = independentChecks(out);
      if (bad.length) failures.push(`seed ${seed}: ${bad.join("; ")}`);
      // K13 on every output
      const problems = checkRunOutput(out);
      if (problems.length)
        failures.push(`seed ${seed}: schema ${problems.join("; ")}`);
      // K7 on every output: no false release
      if (out.kind === "result") {
        const c = out.result?.confidence;
        if ((c?.project.confidence ?? 0) < (c?.project.floor ?? 1) - 1e-9)
          failures.push(`seed ${seed}: false release`);
        for (const d of c?.drivers ?? [])
          if (d.included && d.confidence < d.floor - 1e-9)
            failures.push(`seed ${seed}: driver below floor released`);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(results).toBeGreaterThan(500); // the generator exercises both outcomes
    expect(gaps).toBeGreaterThan(500);
  });
});

describe("K10 sensitivity logic", () => {
  it("conservative <= expected <= optimistic; higher haircut lowers NPV; higher adoption raises it; higher rate lowers NPV for positive net flows", () => {
    let checked = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const out = run(genStrongForm(seed));
      if (out.kind !== "result") continue;
      checked++;
      const r = out.result as Result;
      const s = r.scenarios;
      expect(
        s.conservative.npv_capacity_inclusive as number,
      ).toBeLessThanOrEqual(
        (s.expected.npv_capacity_inclusive as number) + 1e-6,
      );
      expect(s.expected.npv_capacity_inclusive as number).toBeLessThanOrEqual(
        (s.optimistic.npv_capacity_inclusive as number) + 1e-6,
      );
      const h = r.sensitivity.haircut.map(
        (p) => p.npv_capacity_inclusive as number,
      );
      for (let i = 1; i < h.length; i++)
        expect(h[i] as number).toBeLessThanOrEqual((h[i - 1] as number) + 1e-6);
      const a = r.sensitivity.adoption.map(
        (p) => p.npv_capacity_inclusive as number,
      );
      for (let i = 1; i < a.length; i++)
        expect(a[i] as number).toBeGreaterThanOrEqual(
          (a[i - 1] as number) - 1e-6,
        );
      if (r.cash_flows.slice(1).every((c) => c.net >= 0)) {
        const d = r.sensitivity.discount_rate.map(
          (p) => p.npv_capacity_inclusive as number,
        );
        for (let i = 1; i < d.length; i++)
          expect(d[i] as number).toBeLessThanOrEqual(
            (d[i - 1] as number) + 1e-6,
          );
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe("K11 hard vs capacity separation", () => {
  it("time savings with no documented cash has no hard value; hard NPV is null with a reason", () => {
    const out = run(simpleForm());
    expect(out.result?.headline.npv.hard).toBeNull();
    expect(out.result?.headline.null_reasons["npv.hard"]).toBeTruthy();
    expect(sum(out.result?.cash_flows.map((c) => c.benefits_hard) ?? [])).toBe(
      0,
    );
  });
  it("hard value from realized_as_cash never exceeds the documented cash, and capacity is net of it", () => {
    const f = simpleForm({}, [
      inp("realized_as_cash", 10000, "documented", {
        backing: backing("source", "verified"),
      }),
    ]);
    const out = run(f);
    const rows = out.result?.cash_flows.slice(1) ?? [];
    for (const c of rows)
      expect(c.benefits_hard).toBeLessThanOrEqual(10000 + 1e-9);
    expect(sum(rows.map((c) => c.benefits_hard))).toBeGreaterThan(0);
    // capacity + hard equals the time-savings benefit (no double count)
    const ts = out.result?.drivers[0];
    expect(
      sum(rows.map((c) => c.benefits_hard + c.benefits_capacity)),
    ).toBeCloseTo(ts?.total as number, 6);
  });
  it("cash that is not documented (estimate tier) is not counted as hard", () => {
    const f = simpleForm({}, [inp("realized_as_cash", 10000, "estimate")]);
    const out = run(f);
    expect(sum(out.result?.cash_flows.map((c) => c.benefits_hard) ?? [])).toBe(
      0,
    );
  });
  it("customer-borne losses are reported separately and excluded from the cash flows", () => {
    const f = goldenResultForm();
    f.inputs.push(inp("cost_bearer", "customer"));
    const out = run(f);
    const rr = out.result?.drivers.find((d) => d.id === "risk_reduction");
    expect(rr?.label_class).toBe("customer_benefit");
    expect(rr?.share_of_benefit).toBe(0);
    const flows = sum(
      out.result?.cash_flows.map(
        (c) => c.benefits_hard + c.benefits_capacity,
      ) ?? [],
    );
    const others = sum(
      (out.result?.drivers ?? [])
        .filter((d) => d.id !== "risk_reduction")
        .map((d) => d.total),
    );
    expect(flows).toBeCloseTo(others, 6);
  });
  it("both ROIs are labeled and different; hard and capacity-inclusive stay separate", () => {
    const h = run(goldenResultForm()).result?.headline;
    expect(h?.roi.undiscounted.capacity_inclusive).not.toBeNull();
    expect(h?.roi.pv.capacity_inclusive).not.toBeNull();
    expect(h?.roi.undiscounted.capacity_inclusive).not.toBeCloseTo(
      h?.roi.pv.capacity_inclusive as number,
      3,
    );
    expect(h?.npv.hard).not.toBe(h?.npv.capacity_inclusive);
  });
});

describe("K12 guardrail warnings", () => {
  const codes = (o: RunOutput) => (o.result?.warnings ?? []).map((w) => w.code);
  it("clean control: the balanced golden form fires none of the five", () => {
    const c = codes(run(goldenResultForm()));
    for (const k of [
      "DRIVER_CONCENTRATION",
      "VENDOR_CONCENTRATION",
      "DOUBLE_COUNT",
      "NPV_SIGN_FLIP",
      "ASSUMPTION_CONCENTRATION",
    ])
      expect(c).not.toContain(k);
  });
  it("one driver over 50% of benefit (two drivers, one dominant)", () => {
    const f = goldenResultForm();
    f.goals = ["time_savings", "data_quality"];
    f.inputs = f.inputs.filter(
      (i) => !["aro_before", "aro_after", "loss_per_event"].includes(i.id),
    );
    f.inputs = f.inputs.map((i) =>
      i.id === "cost_per_error" ? { ...i, value: 10 } : i,
    );
    expect(codes(run(f))).toContain("DRIVER_CONCENTRATION");
  });
  it("a single-driver project never warns about concentration", () => {
    expect(codes(run(simpleForm()))).not.toContain("DRIVER_CONCENTRATION");
  });
  it("over 50% from vendor-supplied numbers", () => {
    const f = goldenResultForm();
    f.inputs = f.inputs.map((i) =>
      i.id === "hours_saved_per_staff_week" || i.id === "cost_per_error"
        ? { ...i, vendor_supplied: true }
        : i,
    );
    expect(codes(run(f))).toContain("VENDOR_CONCENTRATION");
    expect(codes(run(goldenResultForm()))).not.toContain(
      "VENDOR_CONCENTRATION",
    );
  });
  it("the same hours in two drivers (rework named as a cost source)", () => {
    const f = goldenResultForm();
    f.inputs.push(inp("cost_sources", ["rework", "expedite"]));
    expect(codes(run(f))).toContain("DOUBLE_COUNT");
  });
  it("NPV sign flips within 3 points of the discount rate", () => {
    // one year: NPV = -c0 + B/(1+r). Pick c0 between B/1.13 and B/1.10.
    const f = simpleForm();
    f.horizon_years = 1;
    f.inputs = f.inputs.map((i) =>
      i.id === "adoption_by_year" ? { ...i, value: [100] } : i,
    );
    const base = run(f, { ...relaxed });
    const ben = (base.result?.drivers[0]?.total as number) ?? 0;
    f.inputs = f.inputs.map((i) =>
      i.id === "cost_one_time_vendor_license"
        ? { ...i, value: ben / 1.115 / 1.15 }
        : i.id === "cost_annual_run"
          ? { ...i, value: 0 }
          : i,
    );
    expect(codes(run(f, { ...relaxed }))).toContain("NPV_SIGN_FLIP");
    expect(codes(run(goldenResultForm()))).not.toContain("NPV_SIGN_FLIP");
  });
  it("assumption-tier inputs over 25% of benefit", () => {
    const f = goldenResultForm();
    f.inputs = f.inputs.map((i) =>
      i.id === "cost_per_error" || i.id === "hours_saved_per_staff_week"
        ? { ...i, tier: "assumption" as const }
        : i,
    );
    expect(codes(run(f, { ...relaxed }))).toContain("ASSUMPTION_CONCENTRATION");
    expect(codes(run(goldenResultForm(), { ...relaxed }))).not.toContain(
      "ASSUMPTION_CONCENTRATION",
    );
  });
});

describe("K13 output schema conformance", () => {
  it("result and gap list conform, are JSON-safe, and exclusive", () => {
    const res = run(goldenResultForm());
    const gap = run({
      ...simpleForm(),
      inputs: simpleForm().inputs.map((i) =>
        i.id === "hours_saved_per_staff_week"
          ? { ...i, tier: "estimate" as const }
          : i,
      ),
    });
    for (const o of [res, gap]) {
      expect(checkRunOutput(o)).toEqual([]);
      const s = JSON.stringify(o);
      expect(JSON.stringify(JSON.parse(s))).toBe(s);
    }
    expect(res.gap_list).toBeUndefined();
    expect(gap.result).toBeUndefined();
    expect(gap.kind).toBe("gap_list");
  });
  it("the checker rejects broken outputs", () => {
    const o = run(goldenResultForm());
    expect(checkRunOutput({ ...o, gap_list: {} }).length).toBeGreaterThan(0);
    expect(
      checkRunOutput({ kind: "result", meta: o.meta }).length,
    ).toBeGreaterThan(0);
    const nan = JSON.parse(JSON.stringify(o)) as RunOutput;
    (nan.result as Result).headline.benefits_pv = Number.NaN;
    expect(checkRunOutput(nan).length).toBeGreaterThan(0);
  });
});

describe("K9 traceability (engine part; tool layer pending)", () => {
  it("every step and cost line has a unique ref and the narrative cites only real refs", () => {
    const out = run(goldenResultForm());
    const r = out.result as Result;
    const refs = [
      ...r.drivers.flatMap((d) => d.steps.map((s) => s.ref)),
      ...r.costs.lines.map((l) => l.ref),
    ];
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.every((x) => x.length > 0)).toBe(true);
    expect(scanNarrative(r)).toEqual([]);
  });
  it("the integrity scan flags 100% of seeded uncited numbers", () => {
    const r = run(goldenResultForm()).result as Result;
    const refs = collectRefs(r);
    const seeded = [
      "NPV is 12,345 dollars.",
      "Benefit rises 20% over the horizon.",
      "Savings are 5 hours [Z9].",
      "The total is 10 [A1] and also 20.",
    ];
    for (const s of seeded) expect(findUncitedNumbers(s, refs).length).toBe(1);
    expect(
      findUncitedNumbers("Time savings are capacity value [A1].", refs),
    ).toEqual([]);
  });
});

describe("K15 performance", () => {
  it("largest valid form (4 drivers, 20 years, all cost lines) computes under 50 ms", () => {
    const f = genStrongForm(3);
    f.goals = [
      "time_savings",
      "data_quality",
      "decision_speed",
      "risk_reduction",
    ];
    f.horizon_years = 20;
    f.inputs = [
      ...goldenResultForm().inputs.filter(
        (i) => !["adoption_by_year", "discount_rate_pct"].includes(i.id),
      ),
      inp("discount_rate_pct", 10, "benchmark"),
      inp(
        "adoption_by_year",
        Array.from({ length: 20 }, (_, i) => 50 + i * 2),
        "estimate",
      ),
      inp("decisions_per_year", 100),
      inp("days_to_decide_before", 10, "documented", {
        backing: backing("source", "verified"),
      }),
      inp("days_to_decide_after", 5, "documented", {
        backing: backing("source", "verified"),
      }),
      inp("cost_of_delay_per_day", 100, "documented", {
        backing: backing("source", "verified", "coverage", "recent"),
      }),
      cost("cost_one_time_internal_labor", 1000, "estimated"),
      cost("cost_annual_internal_support", 500, "estimated"),
    ];
    const times: number[] = [];
    let out: RunOutput = run(f);
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      out = run(f);
      times.push(performance.now() - t0);
    }
    expect(out.kind).toBe("result");
    expect(out.result?.drivers.length).toBe(4);
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)] as number).toBeLessThan(50);
  });
});

describe("delay and costs", () => {
  it("delay shifts the first benefit, costs are not shifted, and results reconcile", () => {
    const f = simpleForm({}, [inp("delay_months", 12)]);
    const out = run(f);
    const r = out.result as Result;
    expect(r.cash_flows[1]?.benefits_capacity).toBe(0);
    expect(r.costs.delay_months).toBe(12);
    expect(independentChecks(out)).toEqual([]);
    expect(r.drivers[0]?.steps.some((s) => s.name === "adjusted")).toBe(true);
  });
  it("cost basis sets the uplift per line (15 / 30 / 50) and cost_uplift_pct overrides", () => {
    const f = simpleForm({}, [
      cost("cost_training_change", 1000, "assumed"),
      cost("cost_one_time_internal_labor", 1000, "estimated"),
    ]);
    const lines = run(f).result?.costs.lines ?? [];
    expect(lines.find((l) => l.id === "cost_training_change")?.uplift_pct).toBe(
      50,
    );
    expect(
      lines.find((l) => l.id === "cost_one_time_internal_labor")?.uplift_pct,
    ).toBe(30);
    expect(lines.find((l) => l.id === "cost_annual_run")?.uplift_pct).toBe(15);
    const g = simpleForm({}, [inp("cost_uplift_pct", 27, "documented")]);
    expect(
      (run(g).result?.costs.lines ?? []).every((l) => l.uplift_pct === 27),
    ).toBe(true);
  });
  it("zero cost makes ROI null with a reason and keeps the net benefit", () => {
    const f = simpleForm();
    f.inputs = f.inputs.map((i) =>
      i.id.startsWith("cost_") ? { ...i, value: 0 } : i,
    );
    const h = run(f).result?.headline;
    expect(h?.roi.pv.capacity_inclusive).toBeNull();
    expect(h?.roi.undiscounted.capacity_inclusive).toBeNull();
    expect(h?.null_reasons["roi.pv.capacity_inclusive"]).toBeTruthy();
    expect(h?.npv.capacity_inclusive).toBeGreaterThan(0);
  });
  it("no payback within the horizon is reported as text with null years", () => {
    const f = simpleForm();
    f.inputs = f.inputs.map((i) =>
      i.id === "cost_one_time_vendor_license" ? { ...i, value: 1e9 } : i,
    );
    const h = run(f).result?.headline;
    expect(h?.payback.capacity_inclusive.years).toBeNull();
    expect(h?.payback.capacity_inclusive.text).toBe(
      "No payback within the selected horizon",
    );
  });
});
