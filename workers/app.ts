import { routeAgentRequest } from "agents";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/context.server";
import { agentGate } from "../app/server/agent-gate.server";
export { ValueIQAgent } from "../agents/valueiq-agent";
export { CalculationRun } from "../agents/calculation-run";

const handleRequest = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // `/agents/:agent/:name` goes to the agent, after the access gate.
    const agentResponse = await routeAgentRequest(request, env, {
      onBeforeConnect: agentGate,
      onBeforeRequest: agentGate,
    });
    if (agentResponse) return agentResponse;

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return handleRequest(request, context);
  },
} satisfies ExportedHandler<Env>;
