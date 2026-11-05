import { requireProjectAccess } from "../server/access.server";
import { attachmentDisposition, readProjectFile } from "../server/files.server";
import type { Route } from "./+types/projects.files.download";

/** Streams a project file through the Worker; the bucket is never public. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const access = await requireProjectAccess(request, params.id);
  const found = await readProjectFile(params.fileId, access.projectId);
  if (!found) throw new Response("Not found", { status: 404 });

  const { file, object } = found;
  return new Response(object.body, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(object.size),
      "Content-Disposition": attachmentDisposition(file.name),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      ETag: object.httpEtag,
    },
  });
}
