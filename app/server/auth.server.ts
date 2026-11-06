import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { createDb } from "../../db/client";

// Keep the options in step with `auth.cli.ts`, which generates
// `db/auth-schema.ts` from them.
//
// One instance per call: D1 is only reachable through the Worker's env.
export function createAuth(env: Env) {
  return betterAuth({
    // The base URL follows the request host, limited to this environment's
    // hosts (`AUTH_ALLOWED_HOSTS` in wrangler.jsonc).
    baseURL: { allowedHosts: env.AUTH_ALLOWED_HOSTS.split(",") },
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(env.DB), { provider: "sqlite" }),
    emailAndPassword: { enabled: true },
    plugins: [organization()],
    telemetry: { enabled: false },
  });
}
