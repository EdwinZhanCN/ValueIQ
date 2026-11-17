import { requireProjectAccess } from "../server/access.server";
import { evidenceStatus, findInFile } from "../server/evidence.server";
import type { Route } from "./+types/projects.evidence";

/**
 * Clarify's "Find in file": candidate quotes for one input from one project
 * file, each checked word for word against the file. Writes nothing.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  if (request.method !== "POST")
    throw new Response("Method not allowed", { status: 405 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Forbidden", { status: 403 });
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const inputId = field("inputId");
  const fileId = field("fileId");
  if (!inputId || !fileId || inputId.length > 80 || fileId.length > 120)
    throw new Response("An input and a file are required.", { status: 400 });
  const raw = field("value");
  const value = raw === "" ? null : Number(raw);
  const reply = await findInFile(access, {
    inputId,
    fileId,
    value: value !== null && Number.isFinite(value) ? value : null,
  });
  return Response.json(reply, {
    status: evidenceStatus(reply),
    headers: { "Cache-Control": "private, no-store" },
  });
}
