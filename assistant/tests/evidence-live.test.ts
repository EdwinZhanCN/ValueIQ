// F1 file evidence: the manual live script's dry mode runs on the same code path, with no key.
import { describe, expect, it } from "vitest";
import { main } from "../evidence-live";

describe("F1 live-evidence script (dry mode)", () => {
  it("verifies three sample quotes, rejects the invented one, and needs no key", async () => {
    const lines: string[] = [];
    const code = await main(["--dry"], {}, (l) => lines.push(l));
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("Totals: 3 verified, 1 rejected");
    expect(text).toContain("RESULT: OK");
  });

  it("without --dry and without a key it calls nothing", async () => {
    const lines: string[] = [];
    const code = await main([], {}, (l) => lines.push(l));
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("GEMINI_API_KEY is not set");
  });
});
