/**
 * The agent gate (integration contract section 7). `routeAgentRequest` runs
 * it before any request or WebSocket reaches a `ValueIQAgent`, whose
 * instance name is the project id.
 *
 * - Only `ValueIQAgent` is routable; anything else is 404.
 * - A cross-site `Origin` is refused (403): the session cookie would
 *   otherwise authorize a WebSocket opened from another site.
 * - Signed out is 401, another team's (or a missing) project is 404.
 * - On success the request is forwarded with `x-valueiq-user-id` set, after
 *   deleting any copy the client sent. `onConnect` reads it from there.
 */
import { checkProjectAccess } from "./access.server";

export const USER_ID_HEADER = "x-valueiq-user-id";

const AGENT_CLASS = "ValueIQAgent";

export async function agentGate(
  request: Request,
  route: { className: string; name: string },
): Promise<Request | Response> {
  if (route.className !== AGENT_CLASS) {
    return new Response("Not found", { status: 404 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403 });
  }
  const access = await checkProjectAccess(request, route.name);
  if (access === "signed_out") {
    return new Response("Unauthorized", { status: 401 });
  }
  if (access === "forbidden") {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers(request.headers);
  headers.delete(USER_ID_HEADER);
  headers.set(USER_ID_HEADER, access.userId);
  return new Request(request, { headers });
}
