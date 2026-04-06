import app from "./app.ts";
import { env } from "./env.ts";

const server = Bun.serve({
  hostname: env.HOST,
  port: env.PORT,
  // idleTimeout 0 = disable Bun's default 10s idle-close. Required for the
  // MCP Streamable HTTP transport, which holds a long-lived server-to-client
  // SSE stream open on /mcp waiting for notifications. With the default,
  // Bun would kill that stream every 10s and the MCP client would lose its
  // session registration.
  idleTimeout: 0,
  fetch: app.fetch
});

console.log(`Health backend listening on http://${env.HOST}:${server.port}`);
