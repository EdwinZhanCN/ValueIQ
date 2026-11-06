import { startDevServer, stopDevServer } from "./dev-server.mjs";
let server;
try {
  server = await startDevServer(5187);
  process.env.VALUEIQ_TEST_ORIGIN = server.origin;
  await import("./test-output-pipeline.mjs");
} catch (error) {
  if (server) console.error(server.logs);
  throw error;
} finally {
  await stopDevServer(server);
}
