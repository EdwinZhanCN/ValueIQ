import { describe, expect, it } from "vitest";
import {
  ESTIMATE_CONFIDENCE_BAR,
  INTAKE_ONLY_TOOLS,
  callToolDef,
  createContext,
} from "../tools";
import { goldenResultForm, NOW } from "../../engine/tests/forms";
import type { AppliedInput } from "../../shared/types";

type Agent = "clarify" | "process";
function ctxFor(
  message: string,
  o: {
    verified?: boolean;
    agent?: Agent;
    keepStaff?: boolean;
    description?: string;
    prefill?: { id: string; value: number };
  } = {},
) {
  const form = goldenResultForm();
  if (!o.keepStaff)
    form.inputs = form.inputs.filter((i) => i.id !== "staff_affected");
  if (o.prefill)
    form.inputs = form.inputs.filter((i) => i.id !== o.prefill!.id);
  if (o.prefill)
    form.inputs.push({
      ...o.prefill,
      tier: "estimate",
      origin: "assistant_estimate",
    } as never);
  if (o.description)
    form.inputs.push({
      id: "product_description",
      value: o.description,
      tier: "assumption",
      origin: "user",
    } as never);
  return createContext(form, {
    run_id: "t",
    now: NOW,
    agent: o.agent ?? "clarify",
    intake: {
      message,
      proposals: [],
      applied: [] as AppliedInput[],
      verified: new Map(
        o.verified
          ? [
              [
                "staff_affected",
                { file_id: "f1", quote: "The team has 10 analysts" },
              ],
            ]
          : [],
      ),
    },
  });
}
const TOOL = INTAKE_ONLY_TOOLS.find((t) => t.name === "apply_estimate")!;
type Out = { ok: boolean; reason?: string; tier?: string };
const run = async (
  ctx: ReturnType<typeof ctxFor>,
  a: Record<string, unknown>,
) => (await callToolDef(TOOL, a, ctx)) as Out;
const base = {
  input_id: "staff_affected",
  value: 10,
  confidence: 0.9,
  rationale: "from the description",
};

describe("apply_estimate: code sets the tier, never the model", () => {
  it("applies a verified file quote as documented, unconfirmed", async () => {
    const ctx = ctxFor("", { verified: true });
    const r = await run(ctx, { ...base, basis: "file_quote" });
    expect(r).toMatchObject({ ok: true, tier: "documented" });
    expect(ctx.intake!.applied[0]).toMatchObject({
      tier: "documented",
      origin: "file",
      backing: { source_file_id: "f1", quote_confirmed: false },
    });
  });

  it("refuses a file_quote with no checked quote", async () => {
    const ctx = ctxFor("");
    expect((await run(ctx, { ...base, basis: "file_quote" })).ok).toBe(false);
    expect(ctx.intake!.applied).toEqual([]);
  });

  it("applies a figure the user wrote as an estimate, only if it is in the message", async () => {
    const yes = await run(ctxFor("we have 10 people"), {
      ...base,
      basis: "user_said",
    });
    expect(yes).toMatchObject({ ok: true, tier: "estimate" });
    const no = await run(ctxFor("we have a team"), {
      ...base,
      basis: "user_said",
    });
    expect(no.ok).toBe(false);
  });

  it("applies its own reasoning only at or above the confidence bar", async () => {
    const ok = await run(ctxFor(""), {
      ...base,
      basis: "reasoning",
      confidence: ESTIMATE_CONFIDENCE_BAR,
    });
    expect(ok).toMatchObject({ ok: true, tier: "estimate" });
    const low = ctxFor("");
    const r = await run(low, { ...base, basis: "reasoning", confidence: 0.69 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ask the user/);
    expect(low.intake!.applied).toEqual([]);
  });

  it("applies a proxy only with the labeled default's own value", async () => {
    const ctx = ctxFor("");
    const ok = await run(ctx, {
      input_id: "discount_rate_pct",
      value: 10,
      basis: "proxy",
      confidence: 1,
      rationale: "default",
    });
    expect(ok).toMatchObject({ ok: true, tier: "benchmark" });
    const bad = await run(ctx, {
      input_id: "recapture_pct",
      value: 80,
      basis: "proxy",
      confidence: 1,
      rationale: "default",
    });
    expect(bad.ok).toBe(false);
  });

  it("never lets the agent pick measured", async () => {
    for (const basis of ["file_quote", "proxy", "user_said", "reasoning"]) {
      const ctx = ctxFor("10", { verified: true });
      await run(ctx, { ...base, basis });
      for (const a of ctx.intake!.applied) expect(a.tier).not.toBe("measured");
    }
  });

  it("refuses out-of-range values and inputs the user entered themselves", async () => {
    const range = await run(ctxFor(""), {
      ...base,
      input_id: "recapture_pct",
      value: 150,
      basis: "reasoning",
    });
    expect(range.ok).toBe(false);
    const own = await run(ctxFor("", { keepStaff: true }), {
      ...base,
      value: 12,
      basis: "reasoning",
    });
    expect(own.ok).toBe(false);
  });

  it("is a Clarify tool: the Process agent cannot call it", async () => {
    await expect(
      run(ctxFor("", { agent: "process" }), { ...base, basis: "reasoning" }),
    ).rejects.toThrow(/not available/);
  });
});

describe("apply_estimate: the user asks the assistant to estimate", () => {
  const low = { ...base, basis: "reasoning", confidence: 0.4 };
  it("refuses a low-confidence guess when nobody asked", async () => {
    expect((await run(ctxFor("what next?"), low)).ok).toBe(false);
  });
  it("applies it as an estimate when the user asked to estimate", async () => {
    const ctx = ctxFor("please estimate the rest for me");
    expect(await run(ctx, low)).toMatchObject({ ok: true, tier: "estimate" });
    expect(ctx.intake!.applied[0]).toMatchObject({
      origin: "assistant_estimate",
    });
  });
  it("still refuses a very low confidence guess", async () => {
    const r = await run(ctxFor("estimate it"), { ...low, confidence: 0.1 });
    expect(r.ok).toBe(false);
  });
});

describe("apply_estimate: implausible rates are asked about, not written", () => {
  it("refuses a 50% response rate from reasoning", async () => {
    const ctx = ctxFor("please estimate the response rate");
    const r = await run(ctx, {
      input_id: "response_rate_pct",
      value: 50,
      basis: "reasoning",
      confidence: 0.8,
      rationale: "x",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("typical range");
  });
  it("accepts a realistic one", async () => {
    const ctx = ctxFor("please estimate the response rate");
    const r = await run(ctx, {
      input_id: "response_rate_pct",
      value: 5,
      basis: "reasoning",
      confidence: 0.8,
      rationale: "x",
    });
    expect(r.ok).toBe(true);
  });
});

describe("apply_estimate: figures the description states", () => {
  const withDescription = (text: string) =>
    ctxFor("estimate the rest", { description: text });
  it("applies an exact figure from the description as an estimate", async () => {
    const ctx = withDescription("The subscription is $1,032 per year.");
    const r = await run(ctx, {
      input_id: "cost_annual_internal_support",
      value: 1032,
      basis: "description",
      confidence: 0.9,
      rationale: "subscription price",
    });
    expect(r).toMatchObject({ ok: true, tier: "estimate" });
  });
  it("refuses a figure the description does not state", async () => {
    const ctx = withDescription("The subscription is $1,032 per year.");
    const r = await run(ctx, {
      input_id: "cost_annual_internal_support",
      value: 900,
      basis: "description",
      confidence: 0.9,
      rationale: "guess",
    });
    expect(r.ok).toBe(false);
  });
});

describe("apply_estimate: filled values are not silently re-estimated", () => {
  const filled = {
    input_id: "weeks_per_year",
    value: 30,
    basis: "reasoning",
    confidence: 0.9,
    rationale: "x",
  };
  it("leaves a filled value alone when asked to estimate the rest", async () => {
    const r = await run(
      ctxFor("estimate everything missing", {
        prefill: { id: "weeks_per_year", value: 40 },
      }),
      filled,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("already has a value");
  });
  it("changes it when the user asks for a change", async () => {
    const r = await run(
      ctxFor("change the weeks per year, estimate it again", {
        prefill: { id: "weeks_per_year", value: 40 },
      }),
      filled,
    );
    expect(r.ok).toBe(true);
  });
});
