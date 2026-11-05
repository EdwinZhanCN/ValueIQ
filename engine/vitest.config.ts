import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["engine/tests/**/*.test.ts"],
    reporters: ["default", "./engine/tests/kpi-reporter.ts"],
    testTimeout: 60000,
  },
});
