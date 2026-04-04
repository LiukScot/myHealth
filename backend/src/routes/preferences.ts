import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { userPreferences } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson } from "../helpers.ts";
import { prefsSchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const preferences = new Hono<Env>();

preferences.use(requireAuth);

preferences.get("/", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const row = db
    .select({
      model: userPreferences.model,
      chatRange: userPreferences.chatRange,
      lastRange: userPreferences.lastRange,
      graphSelectionJson: userPreferences.graphSelectionJson,
      updatedAt: userPreferences.updatedAt,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
    .get();

  if (!row) {
    return c.json({
      data: {
        model: "mistral-small-latest",
        chatRange: "all",
        lastRange: "all",
        graphSelection: {}
      }
    });
  }

  let graphSelection = {};
  try {
    graphSelection = JSON.parse(row.graphSelectionJson || "{}");
  } catch {
    graphSelection = {};
  }

  return c.json({
    data: {
      model: row.model,
      chatRange: row.chatRange,
      lastRange: row.lastRange,
      graphSelection,
      updatedAt: row.updatedAt
    }
  });
});

preferences.put("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, prefsSchema);
  db.insert(userPreferences)
    .values({
      userId,
      model: body.model,
      chatRange: body.chatRange,
      lastRange: body.lastRange,
      graphSelectionJson: JSON.stringify(body.graphSelection ?? {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        model: sql`excluded.model`,
        chatRange: sql`excluded.chat_range`,
        lastRange: sql`excluded.last_range`,
        graphSelectionJson: sql`excluded.graph_selection_json`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    })
    .run();

  return c.json({ data: { ok: true } });
});

export default preferences;
