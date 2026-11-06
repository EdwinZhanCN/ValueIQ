import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The Workers runtime module, replaced by a stub for node unit tests.
      "cloudflare:workers": fileURLToPath(
        new URL("../app/server/tests/cf-workers-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: [
      "engine/tests/**/*.test.ts",
      "assistant/tests/**/*.test.ts",
      "app/server/tests/**/*.test.ts",
    ],
    reporters: ["default", "./engine/tests/kpi-reporter.ts"],
    testTimeout: 60000,
  },
});
