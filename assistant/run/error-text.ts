import type { RunError } from "../../shared/types";

const KNOWN_ERROR_CODES = new Set([
  "BAD_INPUT",
  "ACCESS_DENIED",
  "MODEL_ERROR",
  "MODEL_TIMEOUT",
  "ENGINE_INTEGRITY",
  "FILE_UNREADABLE",
  "GATE_FAILED",
]);

/**
 * The workflow throws `CODE: message` (built from our own error mapping). When
 * the run has no stored error event, rebuild a readable error from that text.
 * Anything that does not match, such as a raw runtime error, becomes a
 * generic message: runtime text can hold anything and is never shown as is.
 */
export function errorFromWorkflowText(text: string): RunError {
  const m = /^([A-Z_]+): ([^\n]{1,300})/.exec(text ?? "");
  const code = m?.[1];
  const message = m?.[2];
  if (code && message && KNOWN_ERROR_CODES.has(code)) {
    return {
      code,
      message: message.trim(),
      retryable: code === "MODEL_ERROR" || code === "MODEL_TIMEOUT",
    };
  }
  return {
    code: "MODEL_ERROR",
    message: "The run stopped unexpectedly. Try again.",
    retryable: true,
  };
}
