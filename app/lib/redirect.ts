// Pure and client-safe: the auth pages use these in their components too.

/** Where a signed-in person goes when nothing else asked for a page. */
export function homeFor(team: { id: string } | null) {
  return team ? "/projects" : "/teams/new";
}

/**
 * Accept only a same-site path (`/projects/abc?x=1`), never another origin,
 * a protocol-relative `//host`, or Better Auth's own endpoints.
 */
export function safeRedirect(value: FormDataEntryValue | string | null) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  const base = "http://valueiq.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base || url.pathname.startsWith("/api/")) return null;
  return url.pathname + url.search + url.hash;
}
