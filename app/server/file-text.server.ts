/**
 * Project file text for the assistant (integration contract section 5, Phase 2:
 * `readProjectFileForModel`). Every function is scoped to one project and
 * re-checks that the user is on the project's team, like the run store does.
 * A file id from another project, or a missing one, answers FILE_NOT_FOUND.
 *
 * Extraction is deterministic (no model) and its result is cached in the
 * existing FILES bucket under
 * `teams/{teamId}/projects/{projectId}/extracted/{fileId}.json`, valid while
 * the source object's etag, the file size and the extractor version match.
 * No table, no new bucket. Logs carry ids and hashes only, never contents.
 */
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createDb } from "../../db/client";
import { files } from "../../db/schema";
import {
  EXTRACTOR_VERSION,
  ExtractError,
  extractFileText,
  type ExtractedText,
} from "../../assistant/evidence/extract";
import { MAX_EXTRACT_FILE_BYTES } from "../../assistant/evidence/limits";
import {
  ExcerptError,
  buildExcerpt,
  type Excerpt,
  type ExcerptRequest,
} from "../../assistant/evidence/text";
import type {
  EvidenceEvent,
  FileEvidenceHost,
} from "../../assistant/evidence/host";
import { getProjectMembership } from "./access.server";

export interface FileScope {
  projectId: string;
  /** The trusted caller id (the agent connection), never a client argument. */
  userId: string;
}

export type FileRefusalCode =
  | "ACCESS_DENIED"
  | "FILE_NOT_FOUND"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "FILE_UNREADABLE"
  | "BAD_INPUT";

export interface FileRefusal {
  ok: false;
  code: FileRefusalCode;
  message: string;
}

/** Ids, hashes and counts only. */
export interface FileEvent {
  type: "file_extract" | "file_cache_hit" | "file_refused" | "file_read";
  file_id: string;
  project_id: string;
  sha256?: string;
  kind?: string;
  segments?: number;
  code?: string;
}

export function extractedKey(
  teamId: string,
  projectId: string,
  fileId: string,
): string {
  return `teams/${teamId}/projects/${projectId}/extracted/${fileId}.json`;
}

interface CacheEntry {
  v: number;
  etag: string;
  size: number;
  extracted?: ExtractedText;
  refusal?: { code: FileRefusalCode; message: string };
}

const refuse = (code: FileRefusalCode, message: string): FileRefusal => ({
  ok: false,
  code,
  message,
});

function fromExtractError(e: ExtractError): FileRefusal {
  if (e.code === "UNSUPPORTED_TYPE")
    return refuse("UNSUPPORTED_TYPE", e.message);
  if (e.code === "TOO_LARGE") return refuse("TOO_LARGE", e.message);
  return refuse("FILE_UNREADABLE", e.message);
}

/**
 * The extracted text of one project file, from the cache when it is current.
 * Returns a refusal instead of throwing for anything a caller can cause.
 */
export async function getExtractedText(
  scope: FileScope,
  fileId: string,
  log?: (e: FileEvent) => void,
): Promise<
  { ok: true; text: ExtractedText; name: string; cached: boolean } | FileRefusal
> {
  if (typeof fileId !== "string" || fileId.length === 0 || fileId.length > 120)
    return refuse("BAD_INPUT", "Bad file id");
  const member = await getProjectMembership(scope.projectId, scope.userId);
  if (!member) return refuse("ACCESS_DENIED", "Access denied");
  const row = await createDb(env.DB)
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, scope.projectId)))
    .get();
  const prefix = `teams/${member.teamId}/projects/${scope.projectId}/files/`;
  if (!row || !row.r2Key.startsWith(prefix))
    return refuse("FILE_NOT_FOUND", "That file is not in this project");
  const base = { file_id: row.id, project_id: scope.projectId };
  if (row.size > MAX_EXTRACT_FILE_BYTES) {
    log?.({ type: "file_refused", ...base, code: "TOO_LARGE" });
    return refuse(
      "TOO_LARGE",
      `Files over ${Math.round(MAX_EXTRACT_FILE_BYTES / 1024 / 1024)} MB are not read`,
    );
  }
  const head = await env.FILES.head(row.r2Key);
  if (!head)
    return refuse("FILE_NOT_FOUND", "That file is not in this project");

  const cacheKey = extractedKey(member.teamId, scope.projectId, row.id);
  const hit = await env.FILES.get(cacheKey);
  if (hit) {
    try {
      const c = await hit.json<CacheEntry>();
      if (
        c.v === EXTRACTOR_VERSION &&
        c.etag === head.etag &&
        c.size === row.size
      ) {
        if (c.refusal) {
          log?.({ type: "file_refused", ...base, code: c.refusal.code });
          return refuse(c.refusal.code, c.refusal.message);
        }
        if (c.extracted && c.extracted.file_id === row.id) {
          log?.({
            type: "file_cache_hit",
            ...base,
            sha256: c.extracted.sha256,
            kind: c.extracted.kind,
            segments: c.extracted.segments.length,
          });
          return { ok: true, text: c.extracted, name: row.name, cached: true };
        }
      }
    } catch {
      // a damaged cache entry is rebuilt below
    }
  }

  const object = await env.FILES.get(row.r2Key);
  if (!object)
    return refuse("FILE_NOT_FOUND", "That file is not in this project");
  const bytes = new Uint8Array(await object.arrayBuffer());
  try {
    const extracted = await extractFileText({
      fileId: row.id,
      name: row.name,
      mime: row.mime,
      bytes,
    });
    const entry: CacheEntry = {
      v: EXTRACTOR_VERSION,
      etag: head.etag,
      size: row.size,
      extracted,
    };
    await env.FILES.put(cacheKey, JSON.stringify(entry), {
      httpMetadata: { contentType: "application/json" },
    });
    log?.({
      type: "file_extract",
      ...base,
      sha256: extracted.sha256,
      kind: extracted.kind,
      segments: extracted.segments.length,
    });
    return { ok: true, text: extracted, name: row.name, cached: false };
  } catch (e) {
    if (!(e instanceof ExtractError)) throw e;
    const r = fromExtractError(e);
    await env.FILES.put(
      cacheKey,
      JSON.stringify({
        v: EXTRACTOR_VERSION,
        etag: head.etag,
        size: row.size,
        refusal: { code: r.code, message: r.message },
      } satisfies CacheEntry),
      { httpMetadata: { contentType: "application/json" } },
    );
    log?.({ type: "file_refused", ...base, code: r.code });
    return r;
  }
}

/**
 * Bounded excerpts with locations for the model: project-scoped, access-
 * checked, size-limited. The caller must treat the result as untrusted data.
 */
export async function readProjectFileForModel(
  scope: FileScope,
  fileId: string,
  req: ExcerptRequest = {},
  log?: (e: FileEvent) => void,
): Promise<{ ok: true; excerpt: Excerpt } | FileRefusal> {
  const got = await getExtractedText(scope, fileId, log);
  if (!got.ok) return got;
  try {
    const excerpt = buildExcerpt(got.text, got.name, req);
    log?.({
      type: "file_read",
      file_id: fileId,
      project_id: scope.projectId,
      sha256: got.text.sha256,
      segments: excerpt.excerpt.length,
    });
    return { ok: true, excerpt };
  } catch (e) {
    if (e instanceof ExcerptError) return refuse("BAD_INPUT", e.message);
    throw e;
  }
}

/**
 * The host the file-evidence tools run against, bound to one project and one
 * trusted user. `complete` is the cheap assistant model (assistant/evidence/
 * completer.ts); this module never sees the Gemini key.
 */
export function makeFileHost(
  scope: FileScope,
  complete: FileEvidenceHost["complete"],
  log?: (e: FileEvent | EvidenceEvent) => void,
): FileEvidenceHost {
  return {
    readForModel: async (fileId, req) => {
      const r = await readProjectFileForModel(scope, fileId, req, log);
      return r;
    },
    extractedText: async (fileId) => {
      const r = await getExtractedText(scope, fileId, log);
      return r.ok ? { ok: true, text: r.text, name: r.name } : r;
    },
    complete,
    ...(log ? { log } : {}),
  };
}
