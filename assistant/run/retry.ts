// Retry policy for the calculation step (contract section 8: a model failure retries with backoff,
// then the run ends `failed` with retryable true). Pure, so it is tested without Cloudflare.
import type { RunError } from "../../shared/types";

/** Retries after the first attempt; the workflow step runs at most `1 + RETRY_LIMIT` times. */
export const RETRY_LIMIT = 3;
export const RETRY_DELAY = "10 seconds";

/** True when the step should be attempted again for this failure on this attempt (1-based). */
export function shouldRetry(error: RunError, attempt: number): boolean {
  return error.retryable && attempt <= RETRY_LIMIT;
}

/** True on the last attempt that will run, whatever the failure. */
export function isFinalAttempt(attempt: number): boolean {
  return attempt > RETRY_LIMIT;
}
