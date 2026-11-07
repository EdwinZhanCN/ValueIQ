import { describe, expect, it } from "vitest";
import { errorFromWorkflowText } from "../run/error-text";
import { mapError } from "../run/orchestrator";
import { GeminiHttpError } from "../gemini";

describe("failed run messages", () => {
  it("rebuilds a readable error from the workflow's CODE: message text", () => {
    expect(
      errorFromWorkflowText(
        "MODEL_ERROR: The AI service is busy. Try again in a minute.",
      ),
    ).toEqual({
      code: "MODEL_ERROR",
      message: "The AI service is busy. Try again in a minute.",
      retryable: true,
    });
    expect(
      errorFromWorkflowText("BAD_INPUT: The saved form has no costs").retryable,
    ).toBe(false);
  });

  it("never shows raw runtime text", () => {
    const e = errorFromWorkflowText(
      "Error: D1_ERROR: no such table at /var/task/secret/path.js:12",
    );
    expect(e.message).toBe("The run stopped unexpectedly. Try again.");
    expect(e.code).toBe("MODEL_ERROR");
    expect(errorFromWorkflowText("").message).toContain("stopped unexpectedly");
  });

  it("rejects unknown codes instead of echoing them", () => {
    expect(errorFromWorkflowText("SECRET_LEAK: something").message).toBe(
      "The run stopped unexpectedly. Try again.",
    );
  });

  it("maps model HTTP failures to plain messages", () => {
    const rate = mapError(new GeminiHttpError(429, "x"));
    expect(rate).toEqual({
      code: "MODEL_ERROR",
      message: "The AI service is busy. Try again in a minute.",
      retryable: true,
    });
    expect(mapError(new GeminiHttpError(503, "x")).message).toContain(
      "HTTP 503",
    );
    const auth = mapError(new GeminiHttpError(403, "x"));
    expect(auth.message).toContain("rejected the key");
    expect(auth.retryable).toBe(false);
    expect(mapError(new GeminiHttpError(400, "x")).retryable).toBe(false);
  });

  it("gives unknown errors a safe generic message only when there is no text", () => {
    expect(mapError("boom").message).toBe(
      "Something went wrong while running the assessment.",
    );
  });
});
