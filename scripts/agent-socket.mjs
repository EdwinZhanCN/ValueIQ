/**
 * Opens an Agents SDK WebSocket with the actor's cookie. `opened` is false when
 * the gate refused the handshake. `rpc` follows the SDK client's wire format.
 */
export async function openAgentSocket(origin, path, cookie, extraHeaders) {
  const url = origin.replace(/^http/, "ws") + path;
  const socket = new WebSocket(url, {
    headers: { cookie, origin, ...extraHeaders },
  });
  const pending = new Map();
  const stateWaiters = [];
  let lastState = null;
  const listeners = [];
  socket.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.type === "cf_agent_state") {
      lastState = msg.state;
      listeners.forEach((l) => l(msg.state));
      stateWaiters.splice(0).forEach((resolve) => resolve(msg.state));
    } else if (msg.type === "rpc" && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  });
  const opened = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 8000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(true);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    socket.addEventListener("close", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  let n = 0;
  return {
    opened,
    state: () =>
      lastState
        ? Promise.resolve(lastState)
        : new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("no state message")),
              8000,
            );
            stateWaiters.push((s) => {
              clearTimeout(timer);
              resolve(s);
            });
          }),
    rpc: (method, args, timeoutMs = 15000) =>
      new Promise((resolve, reject) => {
        const id = `m${++n}`;
        const timer = setTimeout(
          () => reject(new Error(`rpc ${method} timed out`)),
          timeoutMs,
        );
        pending.set(id, (msg) => {
          clearTimeout(timer);
          if (!msg.success) reject(new Error(`rpc ${method}: ${msg.error}`));
          else resolve(msg.result);
        });
        socket.send(JSON.stringify({ type: "rpc", id, method, args }));
      }),
    /** Calls `fn` with every later state message. */
    onState: (fn) => listeners.push(fn),
    close: () => socket.close(),
  };
}
