import { Hono } from "hono";
import { eq, and, between, gte, lte, desc, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { dbtEntries } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson } from "../helpers.ts";
import { dbtSchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const dbt = new Hono<Env>();

dbt.use(requireAuth);

dbt.get("/", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conditions = [eq(dbtEntries.userId, userId)];
  if (from && to) {
    conditions.push(between(dbtEntries.entryDate, from, to));
  } else if (from) {
    conditions.push(gte(dbtEntries.entryDate, from));
  } else if (to) {
    conditions.push(lte(dbtEntries.entryDate, to));
  }

  const rows = db
    .select()
    .from(dbtEntries)
    .where(and(...conditions))
    .orderBy(desc(dbtEntries.entryDate), desc(dbtEntries.entryTime), desc(dbtEntries.id))
    .all();

  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      entryDate: row.entryDate,
      entryTime: row.entryTime,
      emotionName: row.emotionName ?? "",
      allowAffirmation: row.allowAffirmation ?? "",
      watchEmotion: row.watchEmotion ?? "",
      bodyLocation: row.bodyLocation ?? "",
      bodyFeeling: row.bodyFeeling ?? "",
      presentMoment: row.presentMoment ?? "",
      emotionReturns: row.emotionReturns ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  });
});

dbt.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, dbtSchema);
  const result = db
    .insert(dbtEntries)
    .values({
      userId,
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      emotionName: body.emotionName ?? "",
      allowAffirmation: body.allowAffirmation ?? "",
      watchEmotion: body.watchEmotion ?? "",
      bodyLocation: body.bodyLocation ?? "",
      bodyFeeling: body.bodyFeeling ?? "",
      presentMoment: body.presentMoment ?? "",
      emotionReturns: body.emotionReturns ?? "",
    })
    .returning({ id: dbtEntries.id })
    .get();
  return c.json({ data: { id: result.id } }, 201);
});

dbt.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const body = await parseJson(c, dbtSchema);
  const updated = db
    .update(dbtEntries)
    .set({
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      emotionName: body.emotionName ?? "",
      allowAffirmation: body.allowAffirmation ?? "",
      watchEmotion: body.watchEmotion ?? "",
      bodyLocation: body.bodyLocation ?? "",
      bodyFeeling: body.bodyFeeling ?? "",
      presentMoment: body.presentMoment ?? "",
      emotionReturns: body.emotionReturns ?? "",
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(dbtEntries.id, id), eq(dbtEntries.userId, userId)))
    .returning({ id: dbtEntries.id })
    .get();
  if (!updated) {
    return c.json({ error: { code: "NOT_FOUND", message: "DBT entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

dbt.delete("/:id", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const deleted = db.delete(dbtEntries).where(and(eq(dbtEntries.id, id), eq(dbtEntries.userId, userId)))
    .returning({ id: dbtEntries.id }).get();
  if (!deleted) {
    return c.json({ error: { code: "NOT_FOUND", message: "DBT entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

export default dbt;
