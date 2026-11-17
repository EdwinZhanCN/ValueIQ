import { requireProjectAccess } from "../server/access.server";
import { getExtractedText } from "../server/file-text.server";
import { summarizeRead, unreadable } from "../lib/file-read";
import type { Route } from "./+types/projects.files.text";

/**
 * What the reader got from one project file (Intake): a count and the first
 * passages as plain text, or why it could not be read. No model.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.projectId);
  const got = await getExtractedText(
    { projectId: access.projectId, userId: access.userId },
    params.fileId,
  );
  if (!got.ok && (got.code === "FILE_NOT_FOUND" || got.code === "BAD_INPUT"))
    throw new Response("Not found", { status: 404 });
  return Response.json(
    got.ok ? summarizeRead(got.text) : unreadable(got.code, got.message),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
