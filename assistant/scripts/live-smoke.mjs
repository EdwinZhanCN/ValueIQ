// Manual live check (Eli runs this). One function-calling round trip per model, on the SAME
// code path as production (assistant/gemini.ts on the Vercel AI SDK).
//   GEMINI_API_KEY=... node assistant/scripts/live-smoke.mjs   (Node 24)
// or put GEMINI_API_KEY=... in the repo-root .dev.vars (gitignored). The key is never printed.

import { readFileSync } from "node:fs";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
let code = 1;
try {
  const { loadGeminiKey } = await server.ssrLoadModule(
    "/assistant/dev-vars.ts",
  );
  const key = loadGeminiKey(process.env, () => {
    try {
      return readFileSync(new URL("../../.dev.vars", import.meta.url), "utf8");
    } catch {
      return undefined;
    }
  });
  const env = { ...process.env, ...(key ? { GEMINI_API_KEY: key } : {}) };
  const mod = await server.ssrLoadModule("/assistant/smoke.ts");
  code = await mod.main(env);
} catch (e) {
  const key = process.env.GEMINI_API_KEY;
  let msg = e instanceof Error ? e.message : String(e);
  if (key) msg = msg.split(key).join("[redacted]");
  console.log(
    `live-smoke failed: ${msg.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")}`,
  );
} finally {
  await server.close();
}
process.exit(code);
