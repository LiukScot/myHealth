import type { Context } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import cookie from "cookie";
import { env } from "./env.ts";
import { TAG_TYPES, type TagType, MOOD_TAG_FIELDS, type MoodTagField } from "./schema.ts";
import type { SQLiteDB } from "./db.ts";

export const PAIN_MULTI_FIELDS = TAG_TYPES;
export type PainMultiField = TagType;

export const MOOD_MULTI_FIELDS = MOOD_TAG_FIELDS;
export type MoodMultiField = MoodTagField;

export type MoodTagMap = Record<MoodMultiField, string[]>;
export type PainTagMap = Record<PainMultiField, string[]>;

export function makeError(
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string>
): Response {
  return Response.json({ error: { code, message, fields } }, { status });
}

export function makeData(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
}

export async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }
  return parsed.data;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  return parsed[name] ?? null;
}

export function buildSessionCookie(sid: string): string {
  return cookie.serialize(env.SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

export function clearSessionCookie(): string {
  return cookie.serialize(env.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

export function toUniqueValues(input: unknown): string[] {
  const rawValues = Array.isArray(input)
    ? input.map((value) => String(value).trim())
    : typeof input === "string"
      ? input.split(/(?<!\d),(?!\d)/).map((value) => value.trim())
      : [];

  const values: string[] = [];
  const seen = new Set<string>();
  for (const value of rawValues) {
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

export function toCsvValue(input: unknown): string {
  return toUniqueValues(input).join(", ");
}

export function emptyPainTags(): PainTagMap {
  return {
    area: [],
    symptoms: [],
    activities: [],
    medicines: [],
    habits: [],
    other: []
  };
}

export function parseLegacyPainTags(input: unknown): PainTagMap {
  const tags = emptyPainTags();
  if (!input || typeof input !== "object") {
    return tags;
  }
  const record = input as Record<string, unknown>;
  for (const field of PAIN_MULTI_FIELDS) {
    tags[field] = toUniqueValues(record[field]);
  }
  return tags;
}

export function rowPainField(row: Record<string, unknown>, field: PainMultiField): string {
  if (row[field] !== undefined) {
    return toCsvValue(row[field]);
  }

  const legacyTags = parseLegacyPainTags(row.tags);
  if (legacyTags[field].length) {
    return legacyTags[field].join(", ");
  }

  return "";
}

export const emptyPainOptions = emptyPainTags;

export function mergeOptions(current: string[], incoming: string[]): string[] {
  const out: string[] = [...current];
  const seen = new Set(current.map((value) => value.toLowerCase()));
  for (const value of incoming) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function loadPainOptionsForUser(db: SQLiteDB, userId: number): PainTagMap {
  const rows = db
    .query<{ field: string; value: string }, [number]>(
      `SELECT field, value FROM pain_options WHERE user_id = ? ORDER BY id ASC`
    )
    .all(userId);
  const out = emptyPainOptions();
  for (const row of rows) {
    if (PAIN_MULTI_FIELDS.includes(row.field as PainMultiField)) {
      out[row.field as PainMultiField].push(row.value);
    }
  }
  return out;
}

export function emptyMoodOptions(): MoodTagMap {
  return { positive_moods: [], negative_moods: [], general_moods: [] };
}

export function loadMoodOptionsForUser(db: SQLiteDB, userId: number): MoodTagMap {
  const rows = db
    .query<{ field: string; value: string }, [number]>(
      `SELECT field, value FROM mood_options WHERE user_id = ? ORDER BY id ASC`
    )
    .all(userId);
  const out = emptyMoodOptions();
  for (const row of rows) {
    if (MOOD_MULTI_FIELDS.includes(row.field as MoodMultiField)) {
      out[row.field as MoodMultiField].push(row.value);
    }
  }
  return out;
}

export function rowsToHealthBackup(diaryRows: any[], painRows: any[]): { diary: any; pain: any } {
  const diary = {
    source: "health-backend",
    imported_at: new Date().toISOString(),
    headers: ["date", "hour", "mood level", "depression", "anxiety", "positive moods", "negative moods", "general moods", "description", "gratitude", "reflection"],
    rows: diaryRows.map((row) => ({
      date: row.entry_date,
      hour: row.entry_time,
      "mood level": row.mood_level ?? "",
      depression: row.depression_level ?? "",
      anxiety: row.anxiety_level ?? "",
      "positive moods": row.positive_moods ?? "",
      "negative moods": row.negative_moods ?? "",
      "general moods": row.general_moods ?? "",
      description: row.description ?? "",
      gratitude: row.gratitude ?? "",
      reflection: row.reflection ?? ""
    }))
  };

  const pain = {
    source: "health-backend",
    imported_at: new Date().toISOString(),
    headers: [
      "date", "hour", "pain level", "fatigue level", "symptoms", "area",
      "activities", "habits", "coffee", "other", "medicines", "note"
    ],
    rows: painRows.map((row) => ({
      date: row.entry_date,
      hour: row.entry_time,
      "pain level": row.pain_level ?? "",
      "fatigue level": row.fatigue_level ?? "",
      symptoms: row.symptoms ?? "",
      area: row.area ?? "",
      activities: row.activities ?? "",
      habits: row.habits ?? "",
      coffee: row.coffee_count ?? "",
      other: row.other ?? "",
      medicines: row.medicines ?? "",
      note: row.note ?? ""
    }))
  };

  return { diary, pain };
}

export function painRowToApi(row: any) {
  return {
    id: row.id,
    entryDate: row.entry_date,
    entryTime: row.entry_time,
    painLevel: row.pain_level,
    fatigueLevel: row.fatigue_level,
    coffeeCount: row.coffee_count,
    area: row.area ?? "",
    symptoms: row.symptoms ?? "",
    activities: row.activities ?? "",
    medicines: row.medicines ?? "",
    habits: row.habits ?? "",
    other: row.other ?? "",
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
