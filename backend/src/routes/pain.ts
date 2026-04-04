import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleDB } from "../db/index.ts";
import { painEntries, painOptions } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import {
  parseJson,
  PAIN_MULTI_FIELDS,
  type PainMultiField,
  type PainTagMap,
  toCsvValue,
  emptyPainTags,
  painRowToApi
} from "../helpers.ts";
import { painSchema, optionFieldSchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

function toNullableInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function extractPainField(body: z.infer<typeof painSchema>, field: PainMultiField): string {
  const direct = body[field];
  if (direct !== undefined) {
    return toCsvValue(direct);
  }
  if (body.tags && Object.prototype.hasOwnProperty.call(body.tags, field)) {
    return toCsvValue(body.tags[field]);
  }
  return "";
}

function loadPainOptionsForUser(db: DrizzleDB, userId: number): PainTagMap {
  const rows = db
    .select({ field: painOptions.field, value: painOptions.value })
    .from(painOptions)
    .where(eq(painOptions.userId, userId))
    .orderBy(painOptions.id)
    .all();
  const out = emptyPainTags();
  for (const row of rows) {
    if (PAIN_MULTI_FIELDS.includes(row.field as PainMultiField)) {
      out[row.field as PainMultiField].push(row.value);
    }
  }
  return out;
}

const pain = new Hono<Env>();

pain.use(requireAuth);

pain.get("/options", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  return c.json({ data: loadPainOptionsForUser(db, userId) });
});

pain.post("/options/remove", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, optionFieldSchema);
  if (!PAIN_MULTI_FIELDS.includes(body.field as PainMultiField)) {
    return c.json({ error: { code: "INVALID_FIELD", message: "Unknown pain field" } }, 400);
  }
  const normalizedValue = body.value.trim();
  if (!normalizedValue) {
    return c.json({ error: { code: "INVALID_VALUE", message: "Value must not be empty" } }, 400);
  }
  db.delete(painOptions)
    .where(and(eq(painOptions.userId, userId), eq(painOptions.field, body.field), eq(painOptions.value, normalizedValue)))
    .run();
  return c.json({ data: { ok: true } });
});

pain.post("/options/restore", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, optionFieldSchema);
  if (!PAIN_MULTI_FIELDS.includes(body.field as PainMultiField)) {
    return c.json({ error: { code: "INVALID_FIELD", message: "Unknown pain field" } }, 400);
  }
  const normalizedValue = body.value.trim();
  if (!normalizedValue) {
    return c.json({ error: { code: "INVALID_VALUE", message: "Value must not be empty" } }, 400);
  }
  db.insert(painOptions)
    .values({ userId, field: body.field, value: normalizedValue })
    .onConflictDoNothing()
    .run();
  return c.json({ data: { ok: true } });
});

pain.get("/", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const rows = db
    .select()
    .from(painEntries)
    .where(eq(painEntries.userId, userId))
    .orderBy(desc(painEntries.entryDate), desc(painEntries.entryTime), desc(painEntries.id))
    .all();
  return c.json({ data: rows.map((row) => painRowToApi(row)) });
});

pain.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, painSchema);
  const result = db
    .insert(painEntries)
    .values({
      userId,
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      painLevel: toNullableInt(body.painLevel),
      fatigueLevel: toNullableInt(body.fatigueLevel),
      coffeeCount: toNullableInt(body.coffeeCount),
      area: extractPainField(body, "area"),
      symptoms: extractPainField(body, "symptoms"),
      activities: extractPainField(body, "activities"),
      medicines: extractPainField(body, "medicines"),
      habits: extractPainField(body, "habits"),
      other: extractPainField(body, "other"),
      note: body.note ?? "",
    })
    .returning({ id: painEntries.id })
    .get();
  return c.json({ data: { id: result.id } }, 201);
});

pain.put("/:id", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const body = await parseJson(c, painSchema);
  const updated = db
    .update(painEntries)
    .set({
      entryDate: body.entryDate,
      entryTime: body.entryTime,
      painLevel: toNullableInt(body.painLevel),
      fatigueLevel: toNullableInt(body.fatigueLevel),
      coffeeCount: toNullableInt(body.coffeeCount),
      area: extractPainField(body, "area"),
      symptoms: extractPainField(body, "symptoms"),
      activities: extractPainField(body, "activities"),
      medicines: extractPainField(body, "medicines"),
      habits: extractPainField(body, "habits"),
      other: extractPainField(body, "other"),
      note: body.note ?? "",
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(eq(painEntries.id, id), eq(painEntries.userId, userId)))
    .returning({ id: painEntries.id })
    .get();
  if (!updated) {
    return c.json({ error: { code: "NOT_FOUND", message: "Pain entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

pain.delete("/:id", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const deleted = db.delete(painEntries).where(and(eq(painEntries.id, id), eq(painEntries.userId, userId)))
    .returning({ id: painEntries.id }).get();
  if (!deleted) {
    return c.json({ error: { code: "NOT_FOUND", message: "Pain entry not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

export { loadPainOptionsForUser };
export default pain;
