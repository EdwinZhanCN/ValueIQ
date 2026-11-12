// Live check of file evidence (Eli runs this by hand). Node 24.
//   GEMINI_API_KEY=... node assistant/scripts/live-evidence.mjs   (real cheap model, bundled sample DOCX and XLSX)
//   node assistant/scripts/live-evidence.mjs --dry                (scripted fake model, no key, no network)
// Prints the verified candidates, the rejected count and the token cost. The key comes from the
// environment or the gitignored .dev.vars and is never printed.

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
  const mod = await server.ssrLoadModule("/assistant/evidence-live.ts");
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
    `live-evidence failed: ${msg.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")}`,
  );
} finally {
  await server.close();
}
process.exit(code);
