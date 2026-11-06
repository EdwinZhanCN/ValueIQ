// What the tool layer needs from its host (the Worker, a test, or a live script). Types only, so the
// tools stay free of Cloudflare and of any model client.
import type { JsonSchema } from "../schema";
import type { ExtractedText } from "./extract/types";
import type { Excerpt, ExcerptRequest } from "./text";

export type FileRefusalCode =
  | "ACCESS_DENIED"
  | "FILE_NOT_FOUND"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "FILE_UNREADABLE"
  | "BAD_INPUT";

export type Refusal = { ok: false; code: FileRefusalCode; message: string };

export interface Usage {
  prompt: number;
  output: number;
  thoughts: number;
  total: number;
}

/** One cheap-model call that returns JSON matching `schema`. `value` is null when unusable. */
export type StructuredCompleter = (req: {
  system: string;
  prompt: string;
  schema: JsonSchema;
}) => Promise<{
  value: unknown;
  problem?: "no_object" | "schema_mismatch";
  usage: Usage;
  model: string;
}>;

/** Ids, hashes and counts only. Never file text, quotes or keys. */
export interface EvidenceEvent {
  type: "evidence_find";
  file_id: string;
  input_id: string;
  model: string;
  accepted: number;
  rejected: number;
  segments_sent: number;
  segments_total: number;
  tokens: number;
  problem?: string;
}

export interface FileEvidenceHost {
  /** Project-scoped, access-checked bounded excerpt (readProjectFileForModel). */
  readForModel(
    fileId: string,
    req: ExcerptRequest,
  ): Promise<{ ok: true; excerpt: Excerpt } | Refusal>;
  /** The whole extracted text. For server-side code only: it is never handed to the model. */
  extractedText(
    fileId: string,
  ): Promise<{ ok: true; text: ExtractedText; name: string } | Refusal>;
  /** The cheap assistant model, used only by the evidence extractor. */
  complete: StructuredCompleter;
  log?: (e: EvidenceEvent) => void;
}
