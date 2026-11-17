import { describe, expect, it } from "vitest";
import { INTAKE_ONLY_TOOLS, TOOLS, callTool, createContext } from "../tools";
import { TOOL_AGENTS, ToolForbiddenError, isToolAllowed } from "../tool-access";
import { goldenResultForm, NOW } from "../../engine/tests/forms";

const ALL = [...TOOLS, ...INTAKE_ONLY_TOOLS];

describe("agent tool allowlist", () => {
  it("has a row for every tool and no row for a tool that does not exist", () => {
    expect(Object.keys(TOOL_AGENTS).sort()).toEqual(
      ALL.map((t) => t.name).sort(),
    );
  });

  it("keeps every engine calculation away from the Clarify agent", () => {
    for (const t of [
      "compute_project",
      "compute_driver",
      "compute_haircut",
      "sensitivity",
      "release_gate",
      "get_confidence",
      "explain_step",
    ]) {
      expect(isToolAllowed("clarify", t)).toBe(false);
      expect(isToolAllowed("process", t)).toBe(true);
    }
  });

  it("keeps every input-writing tool away from the Process agent", () => {
    for (const t of [
      "propose_input",
      "propose_backing",
      "propose_adjustment",
      "apply_override",
      "ask_user",
    ]) {
      expect(isToolAllowed("process", t)).toBe(false);
      expect(isToolAllowed("clarify", t)).toBe(true);
    }
  });

  it("refuses and records a Clarify call to the engine", () => {
    const ctx = createContext(goldenResultForm(), {
      run_id: "r",
      now: NOW,
      agent: "clarify",
    });
    expect(() => callTool("compute_project", {}, ctx)).toThrow(
      ToolForbiddenError,
    );
    expect(ctx.state.denied).toEqual([
      { agent: "clarify", tool: "compute_project" },
    ]);
  });

  it("refuses and records a Process call that would write an input", () => {
    const ctx = createContext(goldenResultForm(), {
      run_id: "r",
      now: NOW,
      agent: "process",
    });
    expect(() => callTool("apply_override", {}, ctx)).toThrow(
      ToolForbiddenError,
    );
    expect(ctx.state.denied?.[0]).toEqual({
      agent: "process",
      tool: "apply_override",
    });
  });

  it("leaves contexts that name no agent unchanged", () => {
    const ctx = createContext(goldenResultForm(), { run_id: "r", now: NOW });
    expect(() =>
      callTool("get_defaults", { goals: ["time_savings"] }, ctx),
    ).not.toThrow();
  });
});
