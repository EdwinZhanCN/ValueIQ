// Schema generation only: the Better Auth CLI reads these options to write
// db/auth-schema.ts and never connects. Keep the plugins and options that
// shape tables in step with app/server/auth.server.ts.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter({}, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
