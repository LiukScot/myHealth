import { Hono } from "hono";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { diaryEntries, painEntries, userAiSettings } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson } from "../helpers.ts";
import { aiKeySchema, chatSchema } from "../schemas.ts";
import { callMistral, normalizeModel, normalizeRange } from "../mistral.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const ai = new Hono<Env>();

ai.use(requireAuth);

ai.get("/key", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const row = db
    .select({ mistralApiKey: userAiSettings.mistralApiKey, updatedAt: userAiSettings.updatedAt })
    .from(userAiSettings)
    .where(eq(userAiSettings.userId, userId))
    .limit(1)
    .get();
  if (!row?.mistralApiKey) {
    return c.json({ data: { hasKey: false } });
  }
  const key = row.mistralApiKey;
  return c.json({
    data: {
      hasKey: true,
      last4: key.length >= 4 ? key.slice(-4) : "",
      updatedAt: row.updatedAt
    }
  });
});

ai.put("/key", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, aiKeySchema);
  db.insert(userAiSettings)
    .values({ userId, mistralApiKey: body.key, updatedAt: sql`CURRENT_TIMESTAMP` })
    .onConflictDoUpdate({
      target: userAiSettings.userId,
      set: { mistralApiKey: sql`excluded.mistral_api_key`, updatedAt: sql`CURRENT_TIMESTAMP` },
    })
    .run();
  return c.json({ data: { hasKey: true } });
});

ai.delete("/key", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  db.update(userAiSettings)
    .set({ mistralApiKey: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(userAiSettings.userId, userId))
    .run();
  return c.json({ data: { hasKey: false } });
});

ai.post("/chat", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, chatSchema);

  const row = db
    .select({ mistralApiKey: userAiSettings.mistralApiKey })
    .from(userAiSettings)
    .where(eq(userAiSettings.userId, userId))
    .limit(1)
    .get();
  const apiKey = row?.mistralApiKey;
  if (!apiKey) {
    return c.json({ error: { code: "NO_AI_KEY", message: "No Mistral key configured" } }, 400);
  }

  const range = normalizeRange(body.range);
  const model = normalizeModel(body.model);

  let diaryRows: (typeof diaryEntries.$inferSelect)[];
  let painRows: (typeof painEntries.$inferSelect)[];

  if (range === "all") {
    diaryRows = db.select().from(diaryEntries).where(eq(diaryEntries.userId, userId))
      .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.entryTime)).limit(250).all();
    painRows = db.select().from(painEntries).where(eq(painEntries.userId, userId))
      .orderBy(desc(painEntries.entryDate), desc(painEntries.entryTime)).limit(250).all();
  } else {
    const cutoff = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    diaryRows = db.select().from(diaryEntries)
      .where(and(eq(diaryEntries.userId, userId), gte(diaryEntries.entryDate, cutoff)))
      .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.entryTime)).limit(250).all();
    painRows = db.select().from(painEntries)
      .where(and(eq(painEntries.userId, userId), gte(painEntries.entryDate, cutoff)))
      .orderBy(desc(painEntries.entryDate), desc(painEntries.entryTime)).limit(250).all();
  }

  const diaryContext = diaryRows
    .map(
      (entry) =>
        `${entry.entryDate} ${entry.entryTime} mood=${entry.moodLevel ?? ""} dep=${entry.depressionLevel ?? ""} anx=${entry.anxietyLevel ?? ""} desc=${entry.description ?? ""} refl=${entry.reflection ?? ""}`
    )
    .join("\n");

  const painContext = painRows
    .map(
      (entry) =>
        `${entry.entryDate} ${entry.entryTime} pain=${entry.painLevel ?? ""} fatigue=${entry.fatigueLevel ?? ""} coffee=${entry.coffeeCount ?? ""} area=${entry.area ?? ""} symptoms=${entry.symptoms ?? ""} note=${entry.note ?? ""}`
    )
    .join("\n");

  const prompt = `Context diary entries:\n${diaryContext || "(none)"}\n\nContext pain entries:\n${painContext || "(none)"}\n\nQuestion:\n${body.message}`;

  try {
    const reply = await callMistral(apiKey, prompt, model);
    return c.json({
      data: {
        reply,
        modelUsed: model,
        context: { diaryRows: diaryRows.length, painRows: painRows.length }
      }
    });
  } catch (error: any) {
    const fallback = `AI unavailable: ${error?.message ?? "unknown error"}\nDiary rows considered: ${diaryRows.length}. Pain rows considered: ${painRows.length}.`;
    return c.json({ data: { reply: fallback, fallback: true } });
  }
});

export default ai;
