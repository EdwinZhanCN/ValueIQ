import { describe, expect, it, vi } from "vitest";

// access.server needs the Workers runtime; the gate takes the check as an argument.
vi.mock("../access.server", () => ({ checkProjectAccess: vi.fn() }));

import {
  AGENT_CLASS,
  USER_ID_HEADER,
  gateAgentRequest,
} from "../agent-gate.server";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://x.test/agents/value-i-q-agent/p1", { headers });
const route = { className: AGENT_CLASS, name: "p1" };
const ok = { userId: "u1", teamId: "t1", projectId: "p1", role: "member" };

describe("agent gate", () => {
  it("answers 401 when signed out", async () => {
    const out = await gateAgentRequest(req(), route, () =>
      Promise.resolve("signed_out"),
    );
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(401);
  });

  it("answers 404 for another team", async () => {
    const out = await gateAgentRequest(req(), route, () =>
      Promise.resolve("forbidden"),
    );
    expect((out as Response).status).toBe(404);
  });

  it("refuses any class other than ValueIQAgent without checking access", async () => {
    const check = vi.fn();
    const out = await gateAgentRequest(
      req(),
      { className: "Other", name: "p1" },
      check,
    );
    expect((out as Response).status).toBe(404);
    expect(check).not.toHaveBeenCalled();
  });

  it("passes the route name as the project id to the access check", async () => {
    const check = vi.fn().mockResolvedValue(ok);
    await gateAgentRequest(req(), route, check);
    expect(check).toHaveBeenCalledWith(expect.any(Request), "p1");
  });

  it("forwards with the user id set and any client copy removed", async () => {
    const out = await gateAgentRequest(
      req({ [USER_ID_HEADER]: "forged", cookie: "a=b" }),
      route,
      () => Promise.resolve({ ...ok, role: "owner" as const }),
    );
    expect(out).toBeInstanceOf(Request);
    const fwd = out as Request;
    expect(fwd.headers.get(USER_ID_HEADER)).toBe("u1");
    expect(fwd.headers.get("cookie")).toBe("a=b");
  });
});
