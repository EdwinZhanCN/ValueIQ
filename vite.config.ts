import agents from "agents/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Transpiles the TC39 decorators behind `@callable()` (Vite 8 / Oxc cannot).
    agents(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
    tailwindcss(),
  ],
  // Pre-bundle the browser agent hook at startup. Found on first use it triggers a
  // mid-session re-optimization and the page crashes with a duplicate-React error.
  optimizeDeps: { include: ["agents/react"] },
  resolve: {
    tsconfigPaths: true,
  },
});
