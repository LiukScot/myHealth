import { Hono } from "hono";
import { eq, and, between, gte, lte, desc, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { diaryEntries } from "../db/index.ts";
import { toNullableNumber } from "../db.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson, parseIdParam, isValidIsoDate } from "../helpers.ts";
import { diarySchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const diary = new Hono<Env>();

diary.use(requireAuth);

diary.get("/", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (from && !isValidIsoDate(from)) return c.json({ error: { code: "INVALID_PARAM", message: "Invalid 'from' date format" } }, 400);
  if (to && !isValidIsoDate(to)) return c.json({ error: { code: "INVALID_PARAM", message: "Invalid 'to' date format" } }, 400);

  const conditions = [eq(diaryEntries.userId, userId)];
  if (from && to) {
    conditions.push(between(diaryEntries.entryDate, from, to));
  } else if (from) {
    conditions.push(gte(diaryEntries.entryDate, from));
  } else if (to) {
    conditions.push(lte(diaryEntries.entryDate, to));
  }

  const rows = db
    .select()
    .from(diaryEntries)
    .where(and(...conditions))
    .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.entryTime), desc(diaryEntries.id))
    .all();

  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      entryDate: row.entryDate,
      entryTime: row.entryTime,
      moodLevel: row.moodLevel,
      depressionLevel: row.depressionLevel,
      anxietyLevel: row.anxietyLevel,
      positiveMoods: row.positiveMoods ?? "",
      negativeMoods: row.negativeMoods ?? "",
      generalMoods: row.generalMoods ?? "",
      description: row.description ?? "",
      gratitude: row.gratitude ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
  });
});

diary.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, diarySchema);
  const result = db
    .insert(diaryEntries)
    .values({
      userId,
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      moodLevel: toNullableNumber(body.moodLevel),
      depressionLevel: toNullableNumber(body.depressionLevel),
      anxietyLevel: toNullableNumber(body.anxietyLevel),
      positiveMoods: body.positiveMoods ?? "",
      negativeMoods: body.negativeMoods ?? "",
      generalMoods: body.generalMoods ?? "",
      description: body.description ?? "",
      gratitude: body.gratitude ?? "",
      reflection: body.reflection ?? "",
    })
    .returning({ id: diaryEntries.id })
    .get();
  return c.json({ data: { id: result.id } }, 201);
});

diary.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const parsed = parseIdParam(c);
  if (parsed instanceof Response) return parsed;
  const { id } = parsed;
  const body = await parseJson(c, diarySchema);
  const updated = db
    .update(diaryEntries)
    .set({
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      moodLevel: toNullableNumber(body.moodLevel),
      depressionLevel: toNullableNumber(body.depressionLevel),
      anxietyLevel: toNullableNumber(body.anxietyLevel),
      positiveMoods: body.positiveMoods ?? "",
      negativeMoods: body.negativeMoods ?? "",
      generalMoods: body.generalMoods ?? "",
      description: body.description ?? "",
      gratitude: body.gratitude ?? "",
      ...(body.reflection !== undefined ? { reflection: body.reflection } : {}),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
    .returning({ id: diaryEntries.id })
    .get();
  if (!updated) {
    return c.json({ error: { code: "NOT_FOUND", message: "Diary entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

diary.delete("/:id", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const parsed = parseIdParam(c);
  if (parsed instanceof Response) return parsed;
  const { id } = parsed;
  const deleted = db.delete(diaryEntries).where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
    .returning({ id: diaryEntries.id }).get();
  if (!deleted) {
    return c.json({ error: { code: "NOT_FOUND", message: "Diary entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

export default diary;
