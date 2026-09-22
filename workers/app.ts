import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "../app/context.server";
export { ValueIQAgent } from "../agents/valueiq-agent";

const handleRequest = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return handleRequest(request, context);
  },
} satisfies ExportedHandler<Env>;
