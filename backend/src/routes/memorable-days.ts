import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { memorableDays, userPreferences } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson } from "../helpers.ts";
import { deriveBirthdayMemorableDay, toMemorableDayView } from "../helpers/memorable-days.ts";
import { memorableDaySchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const memorableDaysRoute = new Hono<Env>();

memorableDaysRoute.use(requireAuth);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

memorableDaysRoute.get("/", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const today = c.req.query("today") || todayIso();

  const rows = db
    .select()
    .from(memorableDays)
    .where(eq(memorableDays.userId, userId))
    .orderBy(desc(memorableDays.date), desc(memorableDays.id))
    .all();

  const prefs = db
    .select({ birthday: userPreferences.birthday })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
    .get();

  const items = rows.map((row) =>
    toMemorableDayView(
      {
        id: row.id,
        date: row.date,
        title: row.title,
        emoji: row.emoji,
        description: row.description,
        repeatMode: row.repeatMode as "one-time" | "monthly" | "yearly",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      today,
    ),
  );

  const birthdayItem = prefs?.birthday ? deriveBirthdayMemorableDay(prefs.birthday, today) : null;
  return c.json({ data: birthdayItem ? [birthdayItem, ...items] : items });
});

memorableDaysRoute.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, memorableDaySchema);
  const created = db
    .insert(memorableDays)
    .values({
      userId,
      date: body.date,
      title: body.title.trim(),
      emoji: body.emoji?.trim() ?? "",
      description: body.description?.trim() ?? "",
      repeatMode: body.repeatMode,
    })
    .returning({ id: memorableDays.id })
    .get();

  return c.json({ data: { id: created.id } }, 201);
});

memorableDaysRoute.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Memorable day not found" } }, 404);
  }
  const body = await parseJson(c, memorableDaySchema);
  const updated = db
    .update(memorableDays)
    .set({
      date: body.date,
      title: body.title.trim(),
      emoji: body.emoji?.trim() ?? "",
      description: body.description?.trim() ?? "",
      repeatMode: body.repeatMode,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(memorableDays.id, id), eq(memorableDays.userId, userId)))
    .returning({ id: memorableDays.id })
    .get();

  if (!updated) {
    return c.json({ error: { code: "NOT_FOUND", message: "Memorable day not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

memorableDaysRoute.delete("/:id", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "Memorable day not found" } }, 404);
  }
  const deleted = db
    .delete(memorableDays)
    .where(and(eq(memorableDays.id, id), eq(memorableDays.userId, userId)))
    .returning({ id: memorableDays.id })
    .get();

  if (!deleted) {
    return c.json({ error: { code: "NOT_FOUND", message: "Memorable day not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

export default memorableDaysRoute;
