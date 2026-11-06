/** Bounded reader for these small HTML form actions; no file uploads. */
export async function readSmallForm(request: Request, limit = 1024 * 1024) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    throw new Response("Expected an encoded form", { status: 415 });
  if (Number(request.headers.get("content-length")) > limit)
    throw new Response("Form too large", { status: 413 });
  const reader = request.body?.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  if (reader)
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          await reader.cancel();
          throw new Response("Form too large", { status: 413 });
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  try {
    return new URLSearchParams(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    throw new Response("Invalid form encoding", { status: 400 });
  }
}
