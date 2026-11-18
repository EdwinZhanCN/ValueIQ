// Which agent may call which tool. This is the server-side control for the two-agent design: the
// dispatcher (callTool / callToolDef) checks it on every call, so prompt wording is never the
// boundary. The Clarify agent can read the project and write inputs but can never reach the engine's
// arithmetic; the Process agent can compute but can never write inputs.
export type AgentName = "clarify" | "process";

const BOTH: readonly AgentName[] = ["clarify", "process"];
const CLARIFY: readonly AgentName[] = ["clarify"];
const PROCESS: readonly AgentName[] = ["process"];

/** Every tool name must appear here; a test fails if a tool is added without a row. */
export const TOOL_AGENTS: Readonly<Record<string, readonly AgentName[]>> = {
  // Read-only helpers both agents may use.
  validate_inputs: BOTH,
  get_defaults: BOTH,
  describe_input: BOTH,
  read_project_file: BOTH,
  find_evidence: BOTH,
  // Readiness only (what is missing, how well backed); it produces no money figure.
  preflight_gate: BOTH,
  // Writes or proposes inputs: Clarify only.
  propose_input: CLARIFY,
  apply_estimate: CLARIFY,
  propose_backing: CLARIFY,
  propose_adjustment: CLARIFY,
  apply_override: CLARIFY,
  ask_user: CLARIFY,
  // Computes numbers: Process only. The Clarify agent can never produce an NPV, ROI or payback.
  compute_haircut: PROCESS,
  compute_driver: PROCESS,
  compute_project: PROCESS,
  sensitivity: PROCESS,
  explain_step: PROCESS,
  get_confidence: PROCESS,
  release_gate: PROCESS,
};

export class ToolForbiddenError extends Error {
  readonly code = "TOOL_FORBIDDEN";
  constructor(
    public readonly tool: string,
    public readonly agent: AgentName,
  ) {
    super(`Tool ${tool} is not available to the ${agent} agent`);
    this.name = "ToolForbiddenError";
  }
}

export function isToolAllowed(agent: AgentName, tool: string): boolean {
  return TOOL_AGENTS[tool]?.includes(agent) === true;
}

/**
 * Throws when the context names an agent and that agent may not call the tool. A tool with no row is
 * refused for a named agent (deny by default). Contexts that name no agent keep today's behaviour,
 * so the existing run and pre-flight paths are unchanged until they are moved over.
 */
export interface AccessContext {
  readonly agent?: AgentName;
  readonly state: { denied?: { agent: AgentName; tool: string }[] };
}

export function assertToolAllowed(ctx: AccessContext, tool: string): void {
  const agent = ctx.agent;
  if (agent === undefined) return;
  if (!isToolAllowed(agent, tool)) {
    ctx.state.denied?.push({ agent, tool });
    throw new ToolForbiddenError(tool, agent);
  }
}
