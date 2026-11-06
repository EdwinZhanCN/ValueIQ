import { routeAgentRequest } from "agents";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/context.server";
import { gateAgentRequest } from "../app/server/agent-gate.server";
export { ValueIQAgent } from "../agents/valueiq-agent";
export { CalculationRun } from "./calculation-run";

const handleRequest = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Agent routes first; the same access gate guards WebSocket and HTTP.
    const agent = await routeAgentRequest(request, env, {
      onBeforeConnect: (req, route) => gateAgentRequest(req, route),
      onBeforeRequest: (req, route) => gateAgentRequest(req, route),
    });
    if (agent) return agent;

    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return handleRequest(request, context);
  },
} satisfies ExportedHandler<Env>;
