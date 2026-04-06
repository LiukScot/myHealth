import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env, allowedOrigins } from "./env.ts";
import { openDb, runMigrations } from "./db.ts";
import { createDrizzle, type DrizzleDB } from "./db/index.ts";
import { cleanupExpiredSessions } from "./middleware/auth.ts";

import auth from "./routes/auth.ts";
import diary from "./routes/diary.ts";
import pain from "./routes/pain.ts";
import mood from "./routes/mood.ts";
import preferences from "./routes/preferences.ts";
import cbt from "./routes/cbt.ts";
import dbt from "./routes/dbt.ts";
import backup from "./routes/backup.ts";
import mcpTokens from "./routes/mcp-tokens.ts";
import { createMcpApp } from "./mcp/server.ts";

// Initialize database
fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
const rawDb = openDb(env.DB_PATH);
runMigrations(rawDb);
const db = createDrizzle(rawDb);

// Clean up expired sessions on startup
cleanupExpiredSessions(rawDb);

// App type with shared variables
type AppEnv = {
  Variables: {
    db: DrizzleDB;
    rawDb: typeof rawDb;
    userId: number;
    userEmail: string;
    sessionSid: string;
  };
};

const app = new Hono<AppEnv>();

// Global middleware: CORS
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (allowedOrigins.has(origin)) return origin;
      return null;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"]
  })
);

// Global middleware: inject database into context
app.use("/api/*", async (c, next) => {
  c.set("db", db);
  c.set("rawDb", rawDb);
  await next();
});

// Mount API routes
app.route("/api/v1/auth", auth);
app.route("/api/v1/diary", diary);
app.route("/api/v1/pain", pain);
app.route("/api/v1/mood", mood);
app.route("/api/v1/cbt", cbt);
app.route("/api/v1/dbt", dbt);
app.route("/api/v1/preferences", preferences);
app.route("/api/v1/backup", backup);
app.route("/api/v1/data", backup);
app.route("/api/v1/mcp/tokens", mcpTokens);

// API 404 fallback
app.all("/api/*", (c) => {
  return c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
});

// MCP server protocol endpoint. Mounted on /mcp with its own auth (PAT) and
// CORS — completely separate from the cookie-authenticated /api/* routes.
// Must be mounted BEFORE the SPA fallback (`app.get("*", ...)`).
app.route("/mcp", createMcpApp(db, rawDb));

// Block other app routes that don't belong to this app
const blockedPrefixes = ["/hub", "/myhealth", "/health", "/mymoney"];
app.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  for (const prefix of blockedPrefixes) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
    }
  }
  await next();
});

// Static file serving + SPA fallback
const publicDir = env.PUBLIC_DIR;

function resolveStaticFile(requestPath: string): string | null {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const unsafePath = path.resolve(publicDir, `.${normalized}`);
  const safeRoot = path.resolve(publicDir);
  if (!unsafePath.startsWith(safeRoot)) return null;
  if (fs.existsSync(unsafePath) && fs.statSync(unsafePath).isFile()) {
    return unsafePath;
  }
  return null;
}

app.get("*", (c) => {
  const pathname = new URL(c.req.url).pathname;

  // Try exact static file
  const staticFile = resolveStaticFile(pathname);
  if (staticFile) {
    return new Response(Bun.file(staticFile));
  }

  // SPA fallback — serve index.html
  const indexFile = path.resolve(publicDir, "index.html");
  if (fs.existsSync(indexFile)) {
    return new Response(Bun.file(indexFile));
  }

  return c.text("Health backend running. Frontend build not found.");
});

// Global error handler
app.onError((err, c) => {
  console.error(err);
  if (err instanceof Response) {
    return err;
  }
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: err?.message ?? "Internal server error" } },
    500
  );
});

export default app;
