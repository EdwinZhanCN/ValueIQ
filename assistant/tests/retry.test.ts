import { describe, expect, it } from "vitest";
import { RETRY_LIMIT, isFinalAttempt, shouldRetry } from "../run/retry";

const retryable = {
  code: "MODEL_ERROR",
  message: "x",
  retryable: true,
} as const;
const fatal = { code: "BAD_INPUT", message: "x", retryable: false } as const;

describe("calculation step retry policy", () => {
  it("retries a retryable failure until the attempts run out", () => {
    expect(shouldRetry(retryable, 1)).toBe(true);
    expect(shouldRetry(retryable, RETRY_LIMIT)).toBe(true);
    expect(shouldRetry(retryable, RETRY_LIMIT + 1)).toBe(false);
  });
  it("never retries a non-retryable failure", () => {
    expect(shouldRetry(fatal, 1)).toBe(false);
  });
  it("knows the final attempt", () => {
    expect(isFinalAttempt(RETRY_LIMIT)).toBe(false);
    expect(isFinalAttempt(RETRY_LIMIT + 1)).toBe(true);
  });
});
