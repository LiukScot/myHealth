import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { moodOptions } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson, MOOD_MULTI_FIELDS, type MoodMultiField, type MoodTagMap } from "../helpers.ts";
import { optionFieldSchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

function emptyMoodOptions(): MoodTagMap {
  return { positive_moods: [], negative_moods: [], general_moods: [] };
}

function loadMoodOptionsForUser(db: DrizzleDB, userId: number): MoodTagMap {
  const rows = db
    .select({ field: moodOptions.field, value: moodOptions.value })
    .from(moodOptions)
    .where(eq(moodOptions.userId, userId))
    .orderBy(moodOptions.id)
    .all();
  const out = emptyMoodOptions();
  for (const row of rows) {
    if (MOOD_MULTI_FIELDS.includes(row.field as MoodMultiField)) {
      out[row.field as MoodMultiField].push(row.value);
    }
  }
  return out;
}

const mood = new Hono<Env>();

mood.use(requireAuth);

mood.get("/options", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  return c.json({ data: loadMoodOptionsForUser(db, userId) });
});

mood.post("/options/remove", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, optionFieldSchema);
  if (!MOOD_MULTI_FIELDS.includes(body.field as MoodMultiField)) {
    return c.json({ error: { code: "INVALID_FIELD", message: "Unknown mood field" } }, 400);
  }
  const normalizedValue = body.value.trim();
  if (!normalizedValue) {
    return c.json({ error: { code: "INVALID_VALUE", message: "Value must not be empty" } }, 400);
  }
  db.delete(moodOptions)
    .where(and(eq(moodOptions.userId, userId), eq(moodOptions.field, body.field), eq(moodOptions.value, normalizedValue)))
    .run();
  return c.json({ data: { ok: true } });
});

mood.post("/options/restore", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, optionFieldSchema);
  if (!MOOD_MULTI_FIELDS.includes(body.field as MoodMultiField)) {
    return c.json({ error: { code: "INVALID_FIELD", message: "Unknown mood field" } }, 400);
  }
  const normalizedValue = body.value.trim();
  if (!normalizedValue) {
    return c.json({ error: { code: "INVALID_VALUE", message: "Value must not be empty" } }, 400);
  }
  db.insert(moodOptions)
    .values({ userId, field: body.field, value: normalizedValue })
    .onConflictDoNothing()
    .run();
  return c.json({ data: { ok: true } });
});

export { loadMoodOptionsForUser };
export default mood;
