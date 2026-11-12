import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LegacyFormFile, RunOutput } from "../../engine";
import {
  goldenResultForm,
  inp,
  NOW,
  simpleForm,
} from "../../engine/tests/forms";
import {
  GeminiHttpError,
  MaxStepsError,
  ModelMismatchError,
  appendAnswer,
  buildRequest,
  hashOf,
  redact,
  runToolLoop,
  type GeminiEvent,
} from "../gemini";
import {
  DEFAULT_MODEL_ASSISTANT,
  DEFAULT_MODEL_CALC,
  ModelConfigError,
  assertExactModelId,
  resolveModels,
} from "../models";
import { NarrativeRejectedError, checkModelText } from "../narrative-guard";
import {
  MAX_QUESTIONS_PER_RUN,
  TOOLS,
  ToolArgError,
  UnknownToolError,
  applyProposal,
  callTool,
  createContext,
  type ToolContext,
} from "../tools";
import { call, fakeFetch, say, toolOutput, type FakeCall } from "./fake";

const KEY = "AIzaSyFAKE_KEY_FOR_TESTS_0123456789abcdef";
const ctxOf = (
  form: LegacyFormFile = goldenResultForm(),
  extra: Partial<Parameters<typeof createContext>[1]> = {},
): ToolContext => createContext(form, { run_id: "run_t", now: NOW, ...extra });
const formWithNotes = (): LegacyFormFile => ({
  ...goldenResultForm(),
  other_notes: "We expect a one-off migration cost of 4000 next year.",
});

const VALID: Record<string, Record<string, unknown>> = {
  validate_inputs: {},
  get_defaults: { goals: ["time_savings"] },
  preflight_gate: {},
  compute_haircut: { input_id: "hours_saved_per_staff_week" },
  propose_backing: {
    input_id: "hours_saved_per_staff_week",
    evidence: { file_id: "f1", quote: "average 30 minutes" },
  },
  propose_adjustment: {
    input_id: "cost_training_change",
    reason: "migration",
    source_quote: "one-off migration cost of 4000",
    proposed_value: 4000,
  },
  compute_driver: { driver_id: "time_savings" },
  compute_project: {},
  sensitivity: { param: "discount_rate" },
  explain_step: { ref: "A1" },
  get_confidence: {},
  release_gate: {},
  ask_user: {
    questions: [
      {
        input_id: "weeks_per_year",
        text: "How many weeks per year does the team work?",
        why_blocking: "It scales the time savings",
      },
    ],
  },
  apply_override: {
    path: "headline.npv.capacity_inclusive",
    value: 1,
    reason: "reviewed",
    author: "eli",
  },
  read_project_file: { file_id: "f1", start: 0, section: "Sheet1", query: "x" },
  find_evidence: {
    file_id: "f1",
    input_id: "hours_saved_per_staff_week",
    section: "Sheet1",
  },
};
const wrongFor = (type: string | undefined): unknown =>
  type === "string"
    ? 123
    : type === "number" || type === "integer"
      ? "5"
      : type === "array"
        ? "x"
        : type === "object"
          ? "x"
          : type === "boolean"
            ? "true"
            : null;

describe("K16 every tool rejects schema-invalid arguments (100%)", () => {
  it("there are exactly the 16 named tools", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      "apply_override",
      "ask_user",
      "compute_driver",
      "compute_haircut",
      "compute_project",
      "explain_step",
      "find_evidence",
      "get_confidence",
      "get_defaults",
      "preflight_gate",
      "propose_adjustment",
      "propose_backing",
      "read_project_file",
      "release_gate",
      "sensitivity",
      "validate_inputs",
    ]);
  });

  it("invalid argument suite: non-objects, unexpected keys, missing required, wrong types, out of range, bad enums", () => {
    let total = 0;
    let rejected = 0;
    for (const tool of TOOLS) {
      const valid = VALID[tool.name] as Record<string, unknown>;
      const cases: unknown[] = [
        "text",
        42,
        [],
        { __unexpected: 1 },
        { ...valid, __unexpected: 1 },
      ];
      for (const k of tool.parameters.required ?? []) {
        cases.push(
          Object.fromEntries(
            Object.entries(valid).filter(([key]) => key !== k),
          ),
        );
      }
      for (const [k, sub] of Object.entries(tool.parameters.properties ?? {})) {
        cases.push({ ...valid, [k]: wrongFor(sub.type) });
        if (sub.enum) cases.push({ ...valid, [k]: "not_allowed" });
        if (sub.minimum !== undefined)
          cases.push({ ...valid, [k]: sub.minimum - 1 });
        if (sub.maxLength !== undefined)
          cases.push({ ...valid, [k]: "x".repeat(sub.maxLength + 1) });
        if (sub.maxItems !== undefined)
          cases.push({
            ...valid,
            [k]: Array.from({ length: sub.maxItems + 1 }, () => "time_savings"),
          });
        if (sub.pattern !== undefined) cases.push({ ...valid, [k]: "BAD ID!" });
      }
      for (const c of cases) {
        total++;
        try {
          callTool(tool.name, c, ctxOf(formWithNotes()));
        } catch (e) {
          if (e instanceof ToolArgError) rejected++;
        }
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(rejected).toBe(total);
  });

  it("valid arguments run for every tool and never coerce (numeric string is rejected)", () => {
    for (const tool of TOOLS) {
      if (tool.name === "explain_step") continue; // needs a result first
      if (tool.async) continue; // file tools run through callToolDef (evidence tests)
      expect(() =>
        callTool(tool.name, VALID[tool.name], ctxOf(formWithNotes())),
      ).not.toThrow();
    }
    const c = ctxOf();
    callTool("compute_project", {}, c);
    expect(() => callTool("explain_step", { ref: "A1" }, c)).not.toThrow();
    expect(() =>
      callTool("sensitivity", { param: "discount_rate", values: ["5"] }, c),
    ).toThrow(ToolArgError);
    expect(() => callTool("no_such_tool", {}, c)).toThrow(UnknownToolError);
  });
});

describe("K16 no tool changes the form unless the user accepted", () => {
  it("the form is frozen and unchanged after every tool call", () => {
    const c = ctxOf(formWithNotes());
    const before = JSON.stringify(c.form);
    expect(Object.isFrozen(c.form)).toBe(true);
    for (const tool of TOOLS) {
      try {
        callTool(tool.name, VALID[tool.name], c);
      } catch {
        // explain_step before a result is fine
      }
    }
    expect(JSON.stringify(c.form)).toBe(before);
    expect(() => {
      (c.form.inputs as unknown as unknown[]).push({});
    }).toThrow(TypeError);
  });

  it("propose_backing and propose_adjustment only propose; acceptance is needed to change a copy", () => {
    const c = ctxOf(formWithNotes());
    const pb = callTool(
      "propose_backing",
      VALID["propose_backing"],
      c,
    ) as Record<string, unknown>;
    expect(pb["status"]).toBe("proposed");
    expect(pb["requires_user_confirmation"]).toBe(true);
    const pa = callTool(
      "propose_adjustment",
      VALID["propose_adjustment"],
      c,
    ) as Record<string, unknown>;
    expect(pa["tier_if_accepted"]).toBe("assumption");
    expect(() => applyProposal(c.form, pb, { accepted: false })).toThrow();
    // accepted without confirming the quote: backing is added but never upgraded to measured
    const f1 = applyProposal(c.form, pb, {
      accepted: true,
      quote_confirmed: false,
    });
    const i1 = f1.inputs.find((i) => i.id === "hours_saved_per_staff_week");
    expect(i1?.tier).toBe("documented");
    expect(i1?.origin).toBe("assistant_accepted");
    expect(i1?.backing?.quote_confirmed).toBe(false);
    // typed time savings can never become measured, even with a confirmed quote
    const f2 = applyProposal(c.form, pb, {
      accepted: true,
      quote_confirmed: true,
    });
    expect(
      f2.inputs.find((i) => i.id === "hours_saved_per_staff_week")?.tier,
    ).toBe("documented");
    const f3 = applyProposal(c.form, pa, { accepted: true });
    const adj = f3.inputs.find((i) => i.id === "cost_training_change");
    expect(adj?.tier).toBe("assumption");
    expect(adj?.value).toBe(4000);
    expect(JSON.stringify(c.form)).toBe(JSON.stringify(formWithNotes()));
  });

  it("a measured upgrade needs a file in the project, a confirmed quote and a non-typed input", () => {
    const form = simpleForm();
    form.inputs = form.inputs.map((i) =>
      i.id === "hours_saved_per_staff_week"
        ? { ...i, origin: "file" as const }
        : i,
    );
    const c = ctxOf(form);
    const pb = callTool(
      "propose_backing",
      VALID["propose_backing"],
      c,
    ) as Record<string, unknown>;
    expect(pb["proposed_tier"]).toBe("measured");
    const unconfirmed = applyProposal(c.form, pb, {
      accepted: true,
      quote_confirmed: false,
    });
    expect(
      unconfirmed.inputs.find((i) => i.id === "hours_saved_per_staff_week")
        ?.tier,
    ).toBe("documented");
    const confirmed = applyProposal(c.form, pb, {
      accepted: true,
      quote_confirmed: true,
    });
    expect(
      confirmed.inputs.find((i) => i.id === "hours_saved_per_staff_week")?.tier,
    ).toBe("measured");
  });

  it("propose_backing rejects a file from another project; adjustments must quote the user's own text", () => {
    const c = ctxOf(formWithNotes());
    expect(() =>
      callTool(
        "propose_backing",
        {
          input_id: "hours_saved_per_staff_week",
          evidence: { file_id: "other", quote: "q" },
        },
        c,
      ),
    ).toThrow(/not in this project/);
    expect(() =>
      callTool(
        "propose_adjustment",
        {
          input_id: "cost_training_change",
          reason: "r",
          source_quote: "one-off migration cost of 4000",
          proposed_value: 5000,
        },
        c,
      ),
    ).toThrow(/appear in the user/);
    expect(() =>
      callTool(
        "propose_adjustment",
        {
          input_id: "cost_training_change",
          reason: "r",
          source_quote: "text not in notes",
        },
        c,
      ),
    ).toThrow(/copied from the user/);
  });

  it("get_defaults returns labeled proxies and does not put them in the form", () => {
    const c = ctxOf(simpleForm());
    const d = callTool(
      "get_defaults",
      { goals: ["time_savings", "data_quality"] },
      c,
    ) as { defaults: { id: string; source: string; tier: string }[] };
    expect(d.defaults.map((x) => x.id)).toEqual(
      expect.arrayContaining([
        "recapture_pct",
        "weeks_per_year",
        "error_cost_multiplier",
      ]),
    );
    expect(
      d.defaults.every((x) => x.source.length > 0 && x.tier.length > 0),
    ).toBe(true);
  });
});

describe("K16 the model cannot edit a result", () => {
  it("tool outputs are deep-frozen copies; the stored result is unchanged by attempted edits", () => {
    const c = ctxOf();
    const out = callTool("compute_project", {}, c) as RunOutput;
    const snapshot = JSON.stringify(out);
    expect(Object.isFrozen(out)).toBe(true);
    expect(() => {
      (
        out.result as unknown as { headline: { npv: { hard: number } } }
      ).headline.npv.hard = 1;
    }).toThrow(TypeError);
    expect(() => {
      (out.meta as { mode: string }).mode = "real";
    }).toThrow(TypeError);
    expect(JSON.stringify(c.state.last)).toBe(snapshot);
    expect(JSON.stringify(callTool("compute_project", {}, c))).toBe(snapshot);
  });

  it("apply_override applies only when the host recorded the user's acceptance, and keeps the computed value", () => {
    const args = {
      path: "headline.npv.capacity_inclusive",
      value: 1000,
      reason: "finance review",
      author: "eli",
    };
    const refused = callTool("apply_override", args, ctxOf()) as {
      applied: boolean;
    };
    expect(refused.applied).toBe(false);
    const c = ctxOf(goldenResultForm(), {
      isAccepted: (w) => w.path === args.path && w.value === 1000,
    });
    const computed = (callTool("compute_project", {}, c) as RunOutput).result
      ?.headline.npv.capacity_inclusive;
    const before = JSON.stringify(c.state.last);
    const ok = callTool("apply_override", args, c) as {
      applied: boolean;
      override: {
        computed_value: number;
        override_value: number;
        reason: string;
        author: string;
        at: string;
      };
    };
    expect(ok.applied).toBe(true);
    expect(ok.override.computed_value).toBe(computed);
    expect(ok.override).toMatchObject({
      override_value: 1000,
      reason: "finance review",
      author: "eli",
      at: NOW,
    });
    expect(JSON.stringify(c.state.last)).toBe(before); // result itself untouched
    // a different value was not accepted by the user
    expect(
      (
        callTool("apply_override", { ...args, value: 2000 }, c) as {
          applied: boolean;
        }
      ).applied,
    ).toBe(false);
    // accepted, but the path is not a number in the result
    const all = ctxOf(goldenResultForm(), { isAccepted: () => true });
    expect(() =>
      callTool("apply_override", { ...args, path: "headline.payback" }, all),
    ).toThrow(/not a number/);
  });
});

describe("K16 ask_user: cap of 3, asked[] dedupe and the trigger rule", () => {
  // time savings without weeks_per_year / recapture_pct: both proxies matter (driver would vanish)
  const missing = (): LegacyFormFile => {
    const f = simpleForm();
    f.inputs = f.inputs.filter(
      (i) => i.id !== "weeks_per_year" && i.id !== "recapture_pct",
    );
    return f;
  };
  const q = (input_id: string) => ({
    input_id,
    text: "Please confirm this value for the project.",
    why_blocking: "It scales the benefit",
  });

  it("asks when the proxy changes the headline, returns the shared Question shape and signals a pause", () => {
    const c = ctxOf(missing());
    const r = callTool(
      "ask_user",
      { questions: [q("weeks_per_year"), q("recapture_pct")] },
      c,
    ) as { pause: boolean; questions: Record<string, unknown>[] };
    expect(r.pause).toBe(true);
    expect(r.questions).toHaveLength(2);
    expect(Object.keys(r.questions[0] as object).sort()).toEqual([
      "affects",
      "id",
      "options",
      "run_id",
      "text",
      "why_blocking",
    ]);
    expect(r.questions[0]).toMatchObject({
      run_id: "run_t",
      options: ["value", "use_proxy", "exclude"],
      affects: ["time_savings"],
    });
    expect(c.state.asked_this_run).toEqual(["weeks_per_year", "recapture_pct"]);
  });

  it("never re-asks an id already in the form's asked[] log or earlier in the run", () => {
    const f = { ...missing(), asked: ["weeks_per_year"] };
    const c = ctxOf(f);
    const r = callTool(
      "ask_user",
      { questions: [q("weeks_per_year"), q("recapture_pct")] },
      c,
    ) as {
      questions: unknown[];
      not_asked: { input_id: string; reason: string }[];
    };
    expect(r.questions).toHaveLength(1);
    expect(r.not_asked[0]).toMatchObject({
      input_id: "weeks_per_year",
      reason: "already_asked",
    });
    const again = callTool(
      "ask_user",
      { questions: [q("recapture_pct")] },
      c,
    ) as { pause: boolean; not_asked: { reason: string }[] };
    expect(again.pause).toBe(false);
    expect(again.not_asked[0]?.reason).toBe("already_asked");
  });

  it("max 3 per run: later questions are refused and become unquantified", () => {
    const c = ctxOf(missing());
    c.state.asked_this_run.push("earlier_1", "earlier_2");
    const r = callTool(
      "ask_user",
      { questions: [q("weeks_per_year"), q("recapture_pct")] },
      c,
    ) as { questions: unknown[]; not_asked: { reason: string }[] };
    expect(r.questions).toHaveLength(1);
    expect(r.not_asked[0]?.reason).toContain("cap_reached");
    expect(c.state.asked_this_run.length).toBe(MAX_QUESTIONS_PER_RUN);
    expect(() =>
      callTool(
        "ask_user",
        { questions: [q("a_b"), q("a_c"), q("a_d"), q("a_e")] },
        ctxOf(missing()),
      ),
    ).toThrow(ToolArgError);
  });

  it("does not ask when the value is already in the form, no labeled proxy exists, or the proxy is immaterial", () => {
    const c = ctxOf(goldenResultForm());
    const r = callTool(
      "ask_user",
      {
        questions: [
          q("weeks_per_year"),
          q("cost_of_delay_per_day"),
          q("error_cost_multiplier"),
        ],
      },
      c,
    ) as { pause: boolean; not_asked: { input_id: string; reason: string }[] };
    expect(r.pause).toBe(false);
    const why = Object.fromEntries(
      r.not_asked.map((n) => [n.input_id, n.reason]),
    );
    expect(why["weeks_per_year"]).toBe("value_already_in_form");
    expect(why["cost_of_delay_per_day"]).toContain("no_labeled_proxy");
    expect(why["error_cost_multiplier"]).toContain("proxy_is_immaterial"); // cost_per_error is given, the multiplier is unused
    expect(c.state.asked_this_run).toEqual([]);
  });

  it("question text may not carry numbers (they must come from tools)", () => {
    const c = ctxOf(missing());
    const r = callTool(
      "ask_user",
      {
        questions: [
          {
            input_id: "weeks_per_year",
            text: "Is it 48 weeks?",
            why_blocking: "scales benefit",
          },
        ],
      },
      c,
    ) as { pause: boolean; not_asked: { reason: string }[] };
    expect(r.pause).toBe(false);
    expect(r.not_asked[0]?.reason).toContain("numbers");
  });

  it("the tool loop pauses on ask_user and resumes with the user's answer", async () => {
    const c = ctxOf(missing());
    const calls: FakeCall[] = [];
    const f = fakeFetch(
      [
        () => ({
          parts: [call("ask_user", { questions: [q("weeks_per_year")] })],
        }),
      ],
      calls,
    );
    const paused = await runToolLoop({
      apiKey: KEY,
      model: DEFAULT_MODEL_CALC,
      system: "s",
      contents: [{ role: "user", parts: [{ text: "run" }] }],
      tools: TOOLS,
      ctx: c,
      fetch: f,
    });
    expect(paused.status).toBe("paused");
    expect(paused.questions).toHaveLength(1);
    expect(calls).toHaveLength(1); // it did not wait or poll
    const resumed = appendAnswer(paused.contents, "Use the labeled proxy.");
    expect(resumed[resumed.length - 1]?.parts.at(-1)?.text).toBe(
      "Use the labeled proxy.",
    );
  });
});

describe("K16 Gemini client: model verification, logging and guards", () => {
  const start = [{ role: "user" as const, parts: [{ text: "go" }] }];
  const base = (
    c: ToolContext,
    f: ReturnType<typeof fakeFetch>,
    extra: object = {},
  ) => ({
    apiKey: KEY,
    model: DEFAULT_MODEL_ASSISTANT,
    system: "sys",
    contents: start,
    tools: TOOLS,
    ctx: c,
    fetch: f,
    ...extra,
  });

  it("throws ModelMismatchError (and records it) when modelVersion differs or is missing", async () => {
    const events: GeminiEvent[] = [];
    const f = fakeFetch([
      () => ({ parts: [say("hi")], modelVersion: "gemini-2.0-flash" }),
    ]);
    await expect(
      runToolLoop(
        base(ctxOf(), f, { log: (e: GeminiEvent) => events.push(e) }),
      ),
    ).rejects.toBeInstanceOf(ModelMismatchError);
    expect(events.map((e) => e.type)).toContain("model_mismatch");
    expect(
      events.find((e) => e.type === "model_mismatch")?.returned_model,
    ).toBe("gemini-2.0-flash");
    await expect(
      runToolLoop(
        base(
          ctxOf(),
          fakeFetch([() => ({ parts: [say("hi")], modelVersion: null })]),
        ),
      ),
    ).rejects.toBeInstanceOf(ModelMismatchError);
    // a matching version passes
    const ok = await runToolLoop(
      base(ctxOf(), fakeFetch([() => ({ parts: [say("Hello.")] })])),
    );
    expect(ok.status).toBe("done");
  });

  it("requests the exact model url with the key only in the x-goog-api-key header", async () => {
    const calls: FakeCall[] = [];
    await runToolLoop({
      ...base(ctxOf(), fakeFetch([() => ({ parts: [say("Hello.")] })], calls)),
      model: DEFAULT_MODEL_CALC,
    });
    expect(calls[0]?.url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL_CALC}:generateContent`,
    );
    expect(calls[0]?.headers["x-goog-api-key"]).toBe(KEY);
    expect(calls[0]?.body).not.toContain(KEY);
    expect(calls[0]?.url).not.toContain(KEY);
  });

  it("function declarations come from the tool schemas", () => {
    const req = buildRequest("s", start, TOOLS);
    const decls = req.tools[0]?.functionDeclarations ?? [];
    expect(decls.map((d) => d.name)).toEqual(TOOLS.map((t) => t.name));
    const ask = decls.find((d) => d.name === "ask_user");
    expect(JSON.stringify(ask?.parameters)).toContain('"OBJECT"');
    expect(JSON.stringify(decls)).not.toContain("additionalProperties");
  });

  it("logs carry ids and hashes only: no key, no prompt text, no file content", async () => {
    const events: GeminiEvent[] = [];
    const secretText = "CONFIDENTIAL-FILE-CONTENT-XYZ";
    const f = fakeFetch([
      () => ({ parts: [call("validate_inputs", {})] }),
      () => ({ parts: [say("Done.")] }),
    ]);
    await runToolLoop({
      ...base(ctxOf(), f),
      contents: [{ role: "user", parts: [{ text: secretText }] }],
      log: (e) => events.push(e),
    });
    const dump = JSON.stringify(events);
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(secretText);
    expect(
      events.some(
        (e) =>
          e.type === "tool_call" &&
          e.tool === "validate_inputs" &&
          /^[0-9a-f]+$/.test(e.args_hash ?? ""),
      ),
    ).toBe(true);
    expect(
      redact(`error with ${KEY} and AIza${"x".repeat(30)}`, [KEY]),
    ).not.toMatch(/AIza/);
    expect(hashOf("a")).toBe(hashOf("a"));
    expect(hashOf("a")).not.toBe(hashOf("b"));
  });

  it("HTTP errors never echo the key; tool errors go back to the model, not up", async () => {
    const f = fakeFetch([
      () => ({ parts: [say(`bad key ${KEY}`)], status: 403 }),
    ]);
    const err = await runToolLoop(base(ctxOf(), f)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiHttpError);
    expect((err as Error).message).not.toContain(KEY);
    const calls: FakeCall[] = [];
    const g = fakeFetch(
      [
        () => ({ parts: [call("compute_haircut", { input_id: 7 })] }),
        () => ({ parts: [say("Done.")] }),
      ],
      calls,
    );
    const r = await runToolLoop(base(ctxOf(), g));
    expect(r.status).toBe("done");
    const resp = calls[1]?.contents.at(-1)?.parts[0]?.functionResponse
      ?.response as { content?: { error?: { code: string } } };
    expect(resp.content?.error?.code).toBe("INVALID_ARGS");
  });

  it("stops at max steps", async () => {
    const f = fakeFetch([() => ({ parts: [call("validate_inputs", {})] })]);
    await expect(
      runToolLoop(base(ctxOf(), f, { maxSteps: 3 })),
    ).rejects.toBeInstanceOf(MaxStepsError);
  });
});

describe("K9 tool layer: numbers only from tool output, with step refs", () => {
  const run = (text: string, withResult = true) => {
    const c = ctxOf();
    if (withResult) callTool("compute_project", {}, c);
    return checkModelText(text, c.state.last);
  };
  const out = (): RunOutput => {
    const c = ctxOf();
    callTool("compute_project", {}, c);
    return c.state.last as RunOutput;
  };

  it("blocks 100% of seeded uncited or invented numbers", () => {
    const o = out();
    const npv = o.result?.headline.npv.capacity_inclusive ?? 0;
    const real = npv.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const seeded = [
      `The NPV is ${real} dollars.`, // real number, no ref
      "The NPV is 999,999.00 dollars [A4].", // invented number, valid ref
      `The NPV is ${real} dollars [Z99].`, // real number, unknown ref
      "Savings are 12345 per month.", // invented and uncited
      `Costs are ${real} [A1] and also 777 hours.`, // last number uncited
    ];
    for (const s of seeded)
      expect(checkModelText(s, o).length).toBeGreaterThan(0);
    expect(checkModelText(`The NPV is ${real} dollars [A4].`, o)).toEqual([]);
    expect(
      checkModelText("Time savings are capacity value, not cash.", o),
    ).toEqual([]);
    expect(run("The NPV is 5 dollars.", false).length).toBe(1); // no tool output yet
  });

  it("the loop rejects an uncited model sentence with NarrativeRejectedError", async () => {
    const c = ctxOf();
    const f = fakeFetch([
      () => ({ parts: [call("compute_project", {})] }),
      () => ({
        parts: [say("The project returns an NPV of 8,181.82 dollars.")],
      }),
    ]);
    const events: GeminiEvent[] = [];
    await expect(
      runToolLoop({
        apiKey: KEY,
        model: DEFAULT_MODEL_CALC,
        system: "s",
        contents: [{ role: "user", parts: [{ text: "go" }] }],
        tools: TOOLS,
        ctx: c,
        fetch: f,
        log: (e) => events.push(e),
      }),
    ).rejects.toBeInstanceOf(NarrativeRejectedError);
    expect(events.map((e) => e.type)).toContain("text_rejected");
  });
});

describe("K16 scripted fake-model run: preflight -> compute -> gate -> narrative", () => {
  it("runs the full loop and publishes the engine's narrative (numbers from tools, with refs)", async () => {
    const c = ctxOf(goldenResultForm(), { mode: "stub" });
    const calls: FakeCall[] = [];
    const f = fakeFetch(
      [
        () => ({ parts: [call("preflight_gate")] }),
        () => ({ parts: [call("compute_project", {})] }),
        () => ({ parts: [call("get_confidence")] }),
        () => ({ parts: [call("release_gate")] }),
        (req) => {
          const out = toolOutput(req.contents, "compute_project") as RunOutput;
          const n = out.result?.narrative;
          return {
            parts: [
              say(`${n?.summary ?? ""} ${n?.by_driver.time_savings ?? ""}`),
            ],
          };
        },
      ],
      calls,
    );
    const events: GeminiEvent[] = [];
    const r = await runToolLoop({
      apiKey: KEY,
      model: DEFAULT_MODEL_CALC,
      system: "calc agent",
      contents: [{ role: "user", parts: [{ text: "run the project" }] }],
      tools: TOOLS,
      ctx: c,
      fetch: f,
      log: (e) => events.push(e),
    });
    expect(r.status).toBe("done");
    expect(
      events.filter((e) => e.type === "tool_call").map((e) => e.tool),
    ).toEqual([
      "preflight_gate",
      "compute_project",
      "get_confidence",
      "release_gate",
    ]);
    const gate = toolOutput(calls[4]?.contents ?? [], "release_gate") as {
      passed: boolean;
    };
    expect(gate.passed).toBe(true);
    expect(r.text).toContain("127,956.73"); // capacity-inclusive NPV of the sample project
    expect(r.text).toMatch(/\[D1, D2, D3\]/);
    expect(checkModelText(r.text, c.state.last)).toEqual([]);
    expect(r.usage.total).toBeGreaterThan(0);
  });

  it("a failing gate returns the gap list and the model may not state a headline", async () => {
    const form = simpleForm();
    form.inputs = form.inputs.map((i) =>
      i.id === "hours_saved_per_staff_week"
        ? { ...i, tier: "estimate" as const }
        : i,
    );
    form.inputs.push(inp("delay_months", 0));
    const c = ctxOf(form);
    const calls: FakeCall[] = [];
    const f = fakeFetch(
      [
        () => ({ parts: [call("compute_project", {})] }),
        () => ({ parts: [call("release_gate")] }),
        () => ({
          parts: [
            say(
              "There is not enough backed evidence to give a result. See the gap list.",
            ),
          ],
        }),
      ],
      calls,
    );
    const r = await runToolLoop({
      apiKey: KEY,
      model: DEFAULT_MODEL_CALC,
      system: "s",
      contents: [{ role: "user", parts: [{ text: "go" }] }],
      tools: TOOLS,
      ctx: c,
      fetch: f,
    });
    expect(r.status).toBe("done");
    const gate = toolOutput(calls[2]?.contents ?? [], "release_gate") as {
      passed: boolean;
      gap_list: { items: unknown[] };
    };
    expect(gate.passed).toBe(false);
    expect(gate.gap_list.items.length).toBeGreaterThan(0);
  });
});

describe("K16 model ids", () => {
  it("defaults, env overrides, and rejection of aliases", () => {
    expect(resolveModels({})).toEqual({
      assistant: "gemini-3.5-flash-lite",
      calc: "gemini-3.6-flash",
    });
    expect(
      resolveModels({
        GEMINI_MODEL_ASSISTANT: "gemini-3.5-flash-lite-002",
        GEMINI_MODEL_CALC: "gemini-3.7-pro",
      }),
    ).toEqual({
      assistant: "gemini-3.5-flash-lite-002",
      calc: "gemini-3.7-pro",
    });
    for (const bad of [
      "gemini-flash-latest",
      "gemini-3.5-flash-latest",
      "gemini-pro",
      "gemini-flash",
      "gpt-4",
      "",
      "gemini-3.5-flash lite",
      "models/gemini-3.5-flash",
    ])
      expect(() => assertExactModelId(bad)).toThrow(ModelConfigError);
    expect(() =>
      resolveModels({ GEMINI_MODEL_CALC: "gemini-flash-latest" }),
    ).toThrow(ModelConfigError);
  });

  it("no other source file names a model", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = `${dir}${name}`;
        if (statSync(p).isDirectory()) {
          if (!["node_modules", "tests", "fixtures"].includes(name))
            walk(`${p}/`);
        } else if (
          /\.(ts|mjs)$/.test(name) &&
          name !== "models.ts" &&
          /gemini-\d/.test(readFileSync(p, "utf8"))
        )
          offenders.push(p);
      }
    };
    walk(`${root}assistant/`);
    walk(`${root}engine/`);
    expect(offenders).toEqual([]);
  });
});
