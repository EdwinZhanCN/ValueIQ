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
  resolve: {
    tsconfigPaths: true,
  },
});
