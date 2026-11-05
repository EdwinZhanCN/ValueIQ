/**
 * Project files (interim-foundation contract 4). Metadata lives in D1
 * (`files`); the bytes live in the private `FILES` R2 bucket under
 * `teams/{teamId}/projects/{projectId}/files/{fileId}`.
 *
 * Callers authorize first with `requireProjectAccess`; these functions do no
 * access check of their own beyond keeping a file inside its project.
 */
import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { files } from "../../db/schema";
import type { ProjectAccess } from "./access.server";

/** Default per-file cap until Q7 sets limits. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ProjectFile = typeof files.$inferSelect;

/** The fields the file list shows; the R2 key never reaches the client. */
export type ProjectFileSummary = Pick<
  ProjectFile,
  "id" | "name" | "mime" | "size" | "description" | "uploadedAt"
>;

export function fileKey(teamId: string, projectId: string, fileId: string) {
  return `teams/${teamId}/projects/${projectId}/files/${fileId}`;
}

export async function listProjectFiles(
  projectId: string,
): Promise<ProjectFileSummary[]> {
  return createDb(env.DB)
    .select({
      id: files.id,
      name: files.name,
      mime: files.mime,
      size: files.size,
      description: files.description,
      uploadedAt: files.uploadedAt,
    })
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(desc(files.uploadedAt))
    .all();
}

/**
 * A file's metadata and its R2 object, or null when the file does not exist
 * or belongs to a different project than the one the caller was authorized
 * for. Read `object.body` once.
 */
export async function readProjectFile(
  fileId: string,
  projectId: string,
): Promise<{ file: ProjectFile; object: R2ObjectBody } | null> {
  const file = await createDb(env.DB)
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, projectId)))
    .get();
  if (!file) return null;
  const object = await env.FILES.get(file.r2Key);
  if (!object) return null;
  return { file, object };
}

export type UploadError = "missing_file" | "missing_description" | "too_large";

/**
 * Stores the object, then its row. If the row cannot be written, the object
 * is removed so R2 holds nothing D1 does not know about.
 */
export async function uploadProjectFile(
  access: ProjectAccess,
  upload: File,
  description: string,
): Promise<ProjectFileSummary | UploadError> {
  const text = description.trim();
  if (!text) return "missing_description";
  if (upload.size > MAX_FILE_BYTES) return "too_large";

  const id = crypto.randomUUID();
  const key = fileKey(access.teamId, access.projectId, id);
  const mime = safeMime(upload.type);
  await env.FILES.put(key, upload, { httpMetadata: { contentType: mime } });
  try {
    const row = await createDb(env.DB)
      .insert(files)
      .values({
        id,
        projectId: access.projectId,
        r2Key: key,
        name: safeName(upload.name),
        mime,
        size: upload.size,
        description: text,
        uploadedBy: access.userId,
      })
      .returning()
      .get();
    return {
      id: row.id,
      name: row.name,
      mime: row.mime,
      size: row.size,
      description: row.description,
      uploadedAt: row.uploadedAt,
    };
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
}

/**
 * For project deletion: removes the R2 objects, then the rows. Call before
 * deleting the project row (its cascade would drop the rows and lose the keys).
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  const db = createDb(env.DB);
  const rows = await db
    .select({ key: files.r2Key })
    .from(files)
    .where(eq(files.projectId, projectId))
    .all();
  const keys = rows.map((row) => row.key);
  // R2 deletes at most 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    await env.FILES.delete(keys.slice(i, i + 1000));
  }
  await db.delete(files).where(eq(files.projectId, projectId));
}

function safeMime(type: string) {
  return /^[\w.+-]+\/[\w.+-]+$/.test(type)
    ? type.toLowerCase()
    : "application/octet-stream";
}

function safeName(name: string) {
  // Keep the base name only, without control characters.
  const base = [...(name.split(/[\\/]/).pop() ?? "")]
    .filter((c) => c >= " " && c !== "\u007f")
    .join("")
    .trim();
  return base.slice(0, 255) || "file";
}

/**
 * `Content-Disposition` for a download: always an attachment, with an ASCII
 * fallback name and the exact name in RFC 5987 form.
 */
export function attachmentDisposition(name: string) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%;]/g, "_") || "file";
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
