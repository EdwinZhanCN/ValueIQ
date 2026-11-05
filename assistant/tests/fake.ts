import type { Content, FetchLike, Part } from "../gemini";

export interface FakeCall {
  url: string;
  headers: Record<string, string>;
  body: string;
  contents: Content[];
}

/** Scripted fake of fetch: each handler gets the parsed request and returns the model's parts. */
export function fakeFetch(
  handlers: ((
    req: FakeCall,
    n: number,
  ) => { parts: Part[]; modelVersion?: string | null; status?: number })[],
  calls: FakeCall[] = [],
): FetchLike {
  let n = 0;
  return (url, init) => {
    const body = JSON.parse(init.body) as { contents: Content[] };
    const call: FakeCall = {
      url,
      headers: init.headers,
      body: init.body,
      contents: body.contents,
    };
    calls.push(call);
    const h = handlers[Math.min(n, handlers.length - 1)];
    n += 1;
    if (!h) throw new Error("no scripted handler");
    const r = h(call, n);
    const status = r.status ?? 200;
    const model = /models\/([^:]+):/.exec(url)?.[1] ?? "";
    const data = {
      ...(r.modelVersion === null
        ? {}
        : { modelVersion: r.modelVersion ?? model }),
      candidates: [{ content: { role: "model", parts: r.parts } }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 22,
        thoughtsTokenCount: 7,
      },
    };
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };
}

export const call = (
  name: string,
  args: Record<string, unknown> = {},
): Part => ({ functionCall: { name, args } });
export const say = (text: string): Part => ({ text });

/** The output of an earlier tool call found in the conversation. */
export function toolOutput(contents: Content[], name: string): unknown {
  for (const c of contents)
    for (const p of c.parts)
      if (p.functionResponse?.name === name)
        return (p.functionResponse.response as { output?: unknown }).output;
  return undefined;
}
