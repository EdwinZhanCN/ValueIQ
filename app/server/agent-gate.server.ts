/**
 * The agent gate (integration contract section 7). `routeAgentRequest` runs it
 * from both `onBeforeConnect` (WebSocket) and `onBeforeRequest` (HTTP), before
 * the project's Durable Object wakes.
 *
 * - any `className` other than `ValueIQAgent` is refused (404);
 * - signed out is 401, another team's project (or a missing one) is 404;
 * - on success the request is forwarded with `x-valueiq-user-id` set, after
 *   deleting any copy the client sent. The agent reads that header in
 *   `onConnect`; it is the only source of the user id.
 */
import { checkProjectAccess, type ProjectAccessResult } from "./access.server";

export const USER_ID_HEADER = "x-valueiq-user-id";
export const AGENT_CLASS = "ValueIQAgent";

type Check = (
  request: Request,
  projectId: string,
) => Promise<ProjectAccessResult>;

export async function gateAgentRequest(
  request: Request,
  route: { className: string; name: string },
  check: Check = checkProjectAccess,
): Promise<Response | Request> {
  if (route.className !== AGENT_CLASS)
    return new Response("Not found", { status: 404 });
  const access = await check(request, route.name);
  if (access === "signed_out")
    return new Response("Unauthorized", { status: 401 });
  if (access === "forbidden") return new Response("Not found", { status: 404 });
  const headers = new Headers(request.headers);
  headers.delete(USER_ID_HEADER);
  headers.set(USER_ID_HEADER, access.userId);
  return new Request(request, { headers });
}
