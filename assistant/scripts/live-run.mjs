// Live end-to-end run (Eli runs this by hand). Node 24.
//   GEMINI_API_KEY=... node assistant/scripts/live-run.mjs        (real models)
//   node assistant/scripts/live-run.mjs --dry                     (scripted fake model, no key, no network)
// Optional: GEMINI_THINKING_BUDGET_CALC=<int>, GEMINI_MODEL_ASSISTANT / GEMINI_MODEL_CALC.
// The key comes from the environment or the gitignored .dev.vars and is never printed.
// The TypeScript sources are loaded through Vite's SSR loader (already a dev dependency).

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
  const mod = await server.ssrLoadModule("/assistant/live-run.ts");
  // key: environment first, else GEMINI_API_KEY from the gitignored .dev.vars in the repo root
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
  code = await mod.main(process.argv.slice(2), env);
} catch (e) {
  const key = process.env.GEMINI_API_KEY;
  let msg = e instanceof Error ? e.message : String(e);
  if (key) msg = msg.split(key).join("[redacted]");
  console.log(
    `live-run failed: ${msg.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")}`,
  );
} finally {
  await server.close();
}
process.exit(code);
