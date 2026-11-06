// Stand-in for `cloudflare:workers` in unit tests: tests set `env.DB` to the SQLite D1 shim and
// `env.FILES` to an in-memory bucket.
export const env: {
  DB: D1Database;
  FILES: R2Bucket;
  GEMINI_API_KEY?: string;
} = {
  DB: undefined as unknown as D1Database,
  FILES: undefined as unknown as R2Bucket,
};
