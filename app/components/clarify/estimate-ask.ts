/**
 * The page-level signals between a card or list row and the assistant chat. A row asks the assistant
 * to estimate one input; the chat answers with the inputs it actually wrote, so the row can show
 * "Estimating…", then disappear into Done, or say it could not.
 */
export const ASK_EVENT = "valueiq:assistant-ask";
export const DONE_EVENT = "valueiq:assistant-done";

export interface AskDetail {
  text: string;
  /** Inputs this request is about (empty for a free-form or "estimate all" request). */
  ids: string[];
}

export interface DoneDetail {
  /** Inputs the assistant wrote this turn. */
  applied: string[];
  /** Whether the assistant turn itself succeeded. */
  ok: boolean;
}

/** The message sent to the assistant for one input; it matches the "estimate for me" rule server-side. */
export const estimateMessage = (label: string) => `Estimate "${label}" for me.`;

/** Accepts the older plain-string detail too. */
export function parseAsk(detail: unknown): AskDetail | null {
  if (typeof detail === "string") return { text: detail, ids: [] };
  if (
    typeof detail === "object" &&
    detail !== null &&
    typeof (detail as AskDetail).text === "string" &&
    Array.isArray((detail as AskDetail).ids)
  )
    return {
      text: (detail as AskDetail).text,
      ids: (detail as AskDetail).ids.filter((id) => typeof id === "string"),
    };
  return null;
}

/** Which of the pending inputs were resolved, and which were not, after an assistant turn. */
export function settle(
  pending: ReadonlySet<string>,
  done: DoneDetail,
): { resolved: string[]; failed: string[] } {
  const wrote = new Set(done.applied);
  const resolved: string[] = [];
  const failed: string[] = [];
  for (const id of pending) (wrote.has(id) ? resolved : failed).push(id);
  return { resolved, failed };
}
