import { Hono } from "hono";
import { eq, and, between, gte, lte, desc, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { cbtEntries } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson } from "../helpers.ts";
import { cbtSchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const cbt = new Hono<Env>();

cbt.use(requireAuth);

cbt.get("/", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conditions = [eq(cbtEntries.userId, userId)];
  if (from && to) {
    conditions.push(between(cbtEntries.entryDate, from, to));
  } else if (from) {
    conditions.push(gte(cbtEntries.entryDate, from));
  } else if (to) {
    conditions.push(lte(cbtEntries.entryDate, to));
  }

  const rows = db
    .select()
    .from(cbtEntries)
    .where(and(...conditions))
    .orderBy(desc(cbtEntries.entryDate), desc(cbtEntries.entryTime), desc(cbtEntries.id))
    .all();

  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      entryDate: row.entryDate,
      entryTime: row.entryTime,
      situation: row.situation ?? "",
      thoughts: row.thoughts ?? "",
      helpfulReasoning: row.helpfulReasoning ?? "",
      mainUnhelpfulThought: row.mainUnhelpfulThought ?? "",
      effectOfBelieving: row.effectOfBelieving ?? "",
      evidenceForAgainst: row.evidenceForAgainst ?? "",
      alternativeExplanation: row.alternativeExplanation ?? "",
      worstBestScenario: row.worstBestScenario ?? "",
      friendAdvice: row.friendAdvice ?? "",
      productiveResponse: row.productiveResponse ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  });
});

cbt.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, cbtSchema);
  const result = db
    .insert(cbtEntries)
    .values({
      userId,
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      situation: body.situation ?? "",
      thoughts: body.thoughts ?? "",
      helpfulReasoning: body.helpfulReasoning ?? "",
      mainUnhelpfulThought: body.mainUnhelpfulThought ?? "",
      effectOfBelieving: body.effectOfBelieving ?? "",
      evidenceForAgainst: body.evidenceForAgainst ?? "",
      alternativeExplanation: body.alternativeExplanation ?? "",
      worstBestScenario: body.worstBestScenario ?? "",
      friendAdvice: body.friendAdvice ?? "",
      productiveResponse: body.productiveResponse ?? "",
    })
    .returning({ id: cbtEntries.id })
    .get();
  return c.json({ data: { id: result.id } }, 201);
});

cbt.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const body = await parseJson(c, cbtSchema);
  const updated = db
    .update(cbtEntries)
    .set({
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      situation: body.situation ?? "",
      thoughts: body.thoughts ?? "",
      helpfulReasoning: body.helpfulReasoning ?? "",
      mainUnhelpfulThought: body.mainUnhelpfulThought ?? "",
      effectOfBelieving: body.effectOfBelieving ?? "",
      evidenceForAgainst: body.evidenceForAgainst ?? "",
      alternativeExplanation: body.alternativeExplanation ?? "",
      worstBestScenario: body.worstBestScenario ?? "",
      friendAdvice: body.friendAdvice ?? "",
      productiveResponse: body.productiveResponse ?? "",
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(cbtEntries.id, id), eq(cbtEntries.userId, userId)))
    .returning({ id: cbtEntries.id })
    .get();
  if (!updated) {
    return c.json({ error: { code: "NOT_FOUND", message: "CBT entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

cbt.delete("/:id", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const deleted = db.delete(cbtEntries).where(and(eq(cbtEntries.id, id), eq(cbtEntries.userId, userId)))
    .returning({ id: cbtEntries.id }).get();
  if (!deleted) {
    return c.json({ error: { code: "NOT_FOUND", message: "CBT entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

export default cbt;
