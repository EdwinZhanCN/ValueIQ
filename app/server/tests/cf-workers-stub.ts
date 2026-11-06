// Stand-in for `cloudflare:workers` in unit tests: tests set `env.DB` to the SQLite D1 shim.
export const env: { DB: D1Database } = {
  DB: undefined as unknown as D1Database,
};
