import { Hono } from "hono";
import { cors } from "hono/cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { DrizzleDB } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { requirePat, type McpAuthVars } from "./auth.ts";

import { registerDiaryTools } from "./tools/diary.ts";
import { registerPainTools } from "./tools/pain.ts";
import { registerCbtTools } from "./tools/cbt.ts";
import { registerDbtTools } from "./tools/dbt.ts";
import { registerMasterDataTools } from "./tools/master-data.ts";
import { registerOverviewTools } from "./tools/overview.ts";
import { registerSchemaResource } from "./resources/schema.ts";
import { registerProfileResource } from "./resources/profile.ts";

export type McpToolContext = {
  db: DrizzleDB;
  rawDb: SQLiteDB;
  userId: number;
};

const SERVER_NAME = "health";
const SERVER_VERSION = "1.0.0";

/**
 * Builds a fresh McpServer instance with all tools and resources registered for
 * a specific authenticated user. A new server is constructed per HTTP request
 * because tool/resource handlers close over `userId` to enforce tenant isolation.
 *
 * Cost is negligible: ~15 tool registrations + 2 resources, all in-memory.
 */
export function buildMcpServer(ctx: McpToolContext): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerDiaryTools(server, ctx);
  registerPainTools(server, ctx);
  registerCbtTools(server, ctx);
  registerDbtTools(server, ctx);
  registerMasterDataTools(server, ctx);
  registerOverviewTools(server, ctx);

  registerSchemaResource(server, ctx);
  registerProfileResource(server, ctx);

  return server;
}

type McpAppEnv = {
  Variables: McpAuthVars;
};

/**
 * Creates the Hono sub-app that handles MCP protocol requests on `/mcp`.
 *
 * Mounted from app.ts as `app.route("/mcp", createMcpApp(db, rawDb))`.
 * The parent app's DB-injection middleware does not cover `/mcp/*` (it scopes
 * to `/api/*`), so this sub-app sets `db` and `rawDb` itself.
 */
export function createMcpApp(db: DrizzleDB, rawDb: SQLiteDB): Hono<McpAppEnv> {
  const mcp = new Hono<McpAppEnv>();

  // CORS for MCP clients. Permissive because access is gated by PAT and the
  // server is reachable only over the user's VPN/Tailscale anyway.
  mcp.use(
    "*",
    cors({
      origin: (origin) => origin ?? "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "mcp-session-id",
        "mcp-protocol-version",
        "last-event-id",
      ],
      exposeHeaders: ["mcp-session-id"],
    })
  );

  // Inject DB before auth middleware (auth needs to query the tokens table).
  mcp.use("*", async (c, next) => {
    c.set("db", db);
    c.set("rawDb", rawDb);
    await next();
  });

  // Lightweight health endpoint for the frontend "Test connection" button.
  // Auth-gated so a working response means the token is valid.
  mcp.get("/healthz", requirePat, (c) => {
    return c.json({ data: { ok: true, userId: c.get("userId") } });
  });

  // MCP protocol endpoint. The transport handles GET (SSE), POST (JSON-RPC),
  // and DELETE (session termination) — we route them all to the same handler.
  mcp.all("/", requirePat, async (c) => {
    const userId = c.get("userId");
    const server = buildMcpServer({ db, rawDb, userId });

    // Stateless mode: we omit `sessionIdGenerator` entirely instead of passing
    // `undefined`, because tsconfig has `exactOptionalPropertyTypes` enabled.
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });

    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return mcp;
}
