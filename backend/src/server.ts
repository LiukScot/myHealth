import fs from "node:fs";
import path from "node:path";
import cookie from "cookie";
import bcrypt from "bcryptjs";
import Redis from "ioredis";
import * as XLSX from "xlsx";
import { z } from "zod";
import { openDb, runMigrations, toNullableInt, toNullableNumber } from "./db.ts";
import { callMistral, normalizeModel, normalizeRange } from "./mistral.ts";

import { TAG_TYPES, type TagType, MOOD_TAG_FIELDS, type MoodTagField } from "./schema.ts";

const PAIN_MULTI_FIELDS = TAG_TYPES;
type PainMultiField = TagType;

const MOOD_MULTI_FIELDS = MOOD_TAG_FIELDS;
type MoodMultiField = MoodTagField;

type MoodTagMap = Record<MoodMultiField, string[]>;

type PainTagMap = Record<PainMultiField, string[]>;

type SessionData = {
  sid: string;
  userId: number;
  email: string;
};

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(5555),
  DB_PATH: z.string().default(path.resolve(process.cwd(), "../data/health.sqlite")),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 30),
  SESSION_COOKIE_NAME: z.string().default("HEALTH_SESSID"),
  SESSION_PREFIX: z.string().default("health:sess:"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173,http://localhost:5555,http://127.0.0.1:5555"),
  PUBLIC_DIR: z.string().default(path.resolve(process.cwd(), "../frontend/dist")),
  COOKIE_SECURE: z.string().default("false")
});

const env = envSchema.parse(process.env);
const allowedOrigins = new Set(
  env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
const db = openDb(env.DB_PATH);
runMigrations(db);

const redis = new Redis(env.REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: 1,
  enableReadyCheck: true
});

redis.on("error", (err) => console.error("[redis] connection error:", err.message));

await redis.ping();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const diarySchema = z.object({
  entryDate: z.string().min(1),
  entryTime: z.string().min(1),
  moodLevel: z.number().min(1).max(9).nullable().optional(),
  depressionLevel: z.number().min(1).max(9).nullable().optional(),
  anxietyLevel: z.number().min(1).max(9).nullable().optional(),
  positiveMoods: z.string().optional().default(""),
  negativeMoods: z.string().optional().default(""),
  generalMoods: z.string().optional().default(""),
  description: z.string().optional().default(""),
  gratitude: z.string().optional().default(""),
  reflection: z.string().optional().default("")
});

const painValueSchema = z.union([z.string(), z.array(z.string())]).optional();

const painSchema = z.object({
  entryDate: z.string().min(1),
  entryTime: z.string().min(1),
  painLevel: z.number().int().min(1).max(9).nullable().optional(),
  fatigueLevel: z.number().int().min(1).max(9).nullable().optional(),
  coffeeCount: z.number().int().min(0).max(50).nullable().optional(),
  area: painValueSchema,
  symptoms: painValueSchema,
  activities: painValueSchema,
  medicines: painValueSchema,
  habits: painValueSchema,
  other: painValueSchema,
  note: z.string().optional().default(""),
  tags: z
    .object({
      area: z.array(z.string()).optional(),
      symptoms: z.array(z.string()).optional(),
      activities: z.array(z.string()).optional(),
      medicines: z.array(z.string()).optional(),
      habits: z.array(z.string()).optional(),
      other: z.array(z.string()).optional()
    })
    .partial()
    .optional()
});

const prefsSchema = z.object({
  model: z.string().default("mistral-small-latest"),
  chatRange: z.string().default("all"),
  lastRange: z.string().default("all"),
  graphSelection: z.record(z.string(), z.any()).default({})
});

const aiKeySchema = z.object({ key: z.string().min(1).max(4096) });

const chatSchema = z.object({
  message: z.string().min(1),
  range: z.string().optional(),
  model: z.string().optional()
});

const backupImportSchema = z.object({
  diary: z
    .object({ rows: z.array(z.record(z.string(), z.any())).default([]) })
    .optional(),
  pain: z
    .object({
      rows: z.array(z.record(z.string(), z.any())).default([]),
      options: z
        .object({
          options: z.record(z.string(), z.array(z.string())).optional(),
          removed: z.record(z.string(), z.array(z.string())).optional()
        })
        .optional()
    })
    .optional(),
  prefs: z.record(z.string(), z.any()).optional()
});

function makeError(
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string>,
  headers?: Headers
): Response {
  const responseHeaders = headers ? new Headers(headers) : new Headers();
  responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify({ error: { code, message, fields } }), { status, headers: responseHeaders });
}

function makeData(data: unknown, status = 200, headers?: Headers): Response {
  const responseHeaders = headers ? new Headers(headers) : new Headers();
  responseHeaders.set("content-type", "application/json");
  return new Response(JSON.stringify({ data }), { status, headers: responseHeaders });
}

async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw makeError("VALIDATION_ERROR", "Invalid request body", 400);
  }
  return parsed.data;
}

function getCorsHeaders(req: Request): Headers | Response {
  const headers = new Headers();
  const origin = req.headers.get("origin");
  if (origin) {
    const requestOrigin = new URL(req.url).origin;
    const isSameOrigin = origin === requestOrigin;
    if (!isSameOrigin && !allowedOrigins.has(origin)) {
      return makeError("ORIGIN_NOT_ALLOWED", `Origin ${origin} is not allowed`, 403);
    }
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("access-control-allow-headers", "Content-Type");
  }
  return headers;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  return parsed[name] ?? null;
}

async function getSession(req: Request): Promise<SessionData | null> {
  const sid = readCookie(req, env.SESSION_COOKIE_NAME);
  if (!sid) return null;
  const raw = await redis.get(`${env.SESSION_PREFIX}${sid}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId: number; email: string };
    return { sid, userId: parsed.userId, email: parsed.email };
  } catch {
    return null;
  }
}

async function createSession(userId: number, email: string): Promise<string> {
  const sid = crypto.randomUUID().replaceAll("-", "");
  await redis.set(`${env.SESSION_PREFIX}${sid}`, JSON.stringify({ userId, email }), "EX", env.SESSION_TTL_SECONDS);
  return sid;
}

async function deleteSession(sid: string): Promise<void> {
  await redis.del(`${env.SESSION_PREFIX}${sid}`);
}

function buildSessionCookie(sid: string): string {
  return cookie.serialize(env.SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

function clearSessionCookie(): string {
  return cookie.serialize(env.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

async function verifyPassword(password: string, storedHash: string): Promise<{ ok: boolean; rehash?: string }> {
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
    const ok = bcrypt.compareSync(password, storedHash);
    if (!ok) return { ok: false };
    const rehash = await Bun.password.hash(password, { algorithm: "argon2id" });
    return { ok: true, rehash };
  }
  const ok = await Bun.password.verify(password, storedHash);
  return { ok };
}

function toUniqueValues(input: unknown): string[] {
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

function toCsvValue(input: unknown): string {
  return toUniqueValues(input).join(", ");
}

function emptyPainTags(): PainTagMap {
  return {
    area: [],
    symptoms: [],
    activities: [],
    medicines: [],
    habits: [],
    other: []
  };
}

function parseLegacyPainTags(input: unknown): PainTagMap {
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

function rowPainField(row: Record<string, unknown>, field: PainMultiField): string {
  if (row[field] !== undefined) {
    return toCsvValue(row[field]);
  }

  const legacyTags = parseLegacyPainTags(row.tags);
  if (legacyTags[field].length) {
    return legacyTags[field].join(", ");
  }

  return "";
}

const emptyPainOptions = emptyPainTags;

function mergeOptions(current: string[], incoming: string[]): string[] {
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


function loadPainOptionsForUser(userId: number): PainTagMap {
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

function emptyMoodOptions(): MoodTagMap {
  return { positive_moods: [], negative_moods: [], general_moods: [] };
}

function loadMoodOptionsForUser(userId: number): MoodTagMap {
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

function rowsToHealthBackup(diaryRows: any[], painRows: any[]): { diary: any; pain: any } {
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
      "date",
      "hour",
      "pain level",
      "fatigue level",
      "symptoms",
      "area",
      "activities",
      "habits",
      "coffee",
      "other",
      "medicines",
      "note"
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

function painRowToApi(row: any) {
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

async function handleApi(req: Request, url: URL, corsHeaders: Headers): Promise<Response> {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (pathname === "/api/v1/auth/register" && method === "POST") {
    return makeError("SIGNUP_DISABLED", "Signup is disabled", 403, undefined, corsHeaders);
  }

  if (pathname === "/api/v1/auth/login" && method === "POST") {
    const body = await parseJson(req, loginSchema);
    const user = db
      .query(`SELECT id, email, password_hash, name, disabled_at FROM users WHERE email = ? LIMIT 1`)
      .get(body.email) as any;

    if (!user) {
      return makeError("INVALID_CREDENTIALS", "Invalid credentials", 401, undefined, corsHeaders);
    }
    if (user.disabled_at) {
      return makeError("ACCOUNT_DISABLED", "Account disabled", 403, undefined, corsHeaders);
    }

    const check = await verifyPassword(body.password, user.password_hash);
    if (!check.ok) {
      return makeError("INVALID_CREDENTIALS", "Invalid credentials", 401, undefined, corsHeaders);
    }

    if (check.rehash) {
      db.query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(check.rehash, user.id);
    }

    const sid = await createSession(user.id, user.email);
    const headers = new Headers(corsHeaders);
    headers.append("set-cookie", buildSessionCookie(sid));
    return makeData({ email: user.email, name: user.name ?? null }, 200, headers);
  }

  if (pathname === "/api/v1/auth/logout" && method === "POST") {
    const session = await getSession(req);
    if (session) {
      await deleteSession(session.sid);
    }
    const headers = new Headers(corsHeaders);
    headers.append("set-cookie", clearSessionCookie());
    return makeData({ ok: true }, 200, headers);
  }

  if (pathname === "/api/v1/auth/session" && method === "GET") {
    const session = await getSession(req);
    if (!session) {
      return makeData({ authenticated: false }, 200, corsHeaders);
    }
    const user = db.query(`SELECT id, email, name FROM users WHERE id = ? LIMIT 1`).get(session.userId) as any;
    if (!user) {
      return makeData({ authenticated: false }, 200, corsHeaders);
    }
    return makeData({ authenticated: true, user: { id: user.id, email: user.email, name: user.name ?? null } }, 200, corsHeaders);
  }

  const session = await getSession(req);
  if (!session) {
    return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
  }

  const me = db.query(`SELECT id, email, name FROM users WHERE id = ? LIMIT 1`).get(session.userId) as any;
  if (!me) {
    return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
  }
  const userId = Number(me.id);

  if (pathname === "/api/v1/auth/change-password" && method === "POST") {
    const body = await parseJson(req, changePasswordSchema);
    const row = db.query(`SELECT password_hash FROM users WHERE id = ? LIMIT 1`).get(userId) as any;
    if (!row) {
      return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
    }
    const current = await verifyPassword(body.currentPassword, row.password_hash);
    if (!current.ok) {
      return makeError("INVALID_CURRENT_PASSWORD", "Current password is incorrect", 400, undefined, corsHeaders);
    }
    const newHash = await Bun.password.hash(body.newPassword, { algorithm: "argon2id" });
    db.query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newHash, userId);

    await deleteSession(session.sid);
    const sid = await createSession(userId, me.email);
    const headers = new Headers(corsHeaders);
    headers.append("set-cookie", buildSessionCookie(sid));
    return makeData({ ok: true }, 200, headers);
  }

  if (pathname === "/api/v1/diary" && method === "GET") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    let rows: any[] = [];
    if (from && to) {
      rows = db
        .query(
          `SELECT * FROM diary_entries WHERE user_id = ? AND entry_date BETWEEN ? AND ? ORDER BY entry_date DESC, entry_time DESC, id DESC`
        )
        .all(userId, from, to) as any[];
    } else if (from) {
      rows = db
        .query(`SELECT * FROM diary_entries WHERE user_id = ? AND entry_date >= ? ORDER BY entry_date DESC, entry_time DESC, id DESC`)
        .all(userId, from) as any[];
    } else if (to) {
      rows = db
        .query(`SELECT * FROM diary_entries WHERE user_id = ? AND entry_date <= ? ORDER BY entry_date DESC, entry_time DESC, id DESC`)
        .all(userId, to) as any[];
    } else {
      rows = db
        .query(`SELECT * FROM diary_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC, id DESC`)
        .all(userId) as any[];
    }

    return makeData(
      rows.map((row) => ({
        id: row.id,
        entryDate: row.entry_date,
        entryTime: row.entry_time,
        moodLevel: row.mood_level,
        depressionLevel: row.depression_level,
        anxietyLevel: row.anxiety_level,
        positiveMoods: row.positive_moods ?? "",
        negativeMoods: row.negative_moods ?? "",
        generalMoods: row.general_moods ?? "",
        description: row.description ?? "",
        gratitude: row.gratitude ?? "",
        reflection: row.reflection ?? "",
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      200,
      corsHeaders
    );
  }

  if (pathname === "/api/v1/diary" && method === "POST") {
    const body = await parseJson(req, diarySchema);
    const result = db
      .query(
        `INSERT INTO diary_entries (user_id, entry_date, entry_time, mood_level, depression_level, anxiety_level, positive_moods, negative_moods, general_moods, description, gratitude, reflection)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        body.entryDate,
        body.entryTime,
        toNullableNumber(body.moodLevel),
        toNullableNumber(body.depressionLevel),
        toNullableNumber(body.anxietyLevel),
        body.positiveMoods ?? "",
        body.negativeMoods ?? "",
        body.generalMoods ?? "",
        body.description ?? "",
        body.gratitude ?? "",
        body.reflection ?? ""
      );
    return makeData({ id: Number(result.lastInsertRowid) }, 201, corsHeaders);
  }

  const diaryMatch = pathname.match(/^\/api\/v1\/diary\/(\d+)$/);
  if (diaryMatch && method === "PUT") {
    const id = Number(diaryMatch[1]);
    const body = await parseJson(req, diarySchema);
    const result = db
      .query(
        `UPDATE diary_entries
         SET entry_date = ?, entry_time = ?, mood_level = ?, depression_level = ?, anxiety_level = ?, positive_moods = ?, negative_moods = ?, general_moods = ?, description = ?, gratitude = ?, reflection = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`
      )
      .run(
        body.entryDate,
        body.entryTime,
        toNullableNumber(body.moodLevel),
        toNullableNumber(body.depressionLevel),
        toNullableNumber(body.anxietyLevel),
        body.positiveMoods ?? "",
        body.negativeMoods ?? "",
        body.generalMoods ?? "",
        body.description ?? "",
        body.gratitude ?? "",
        body.reflection ?? "",
        id,
        userId
      );
    if (!result.changes) {
      return makeError("NOT_FOUND", "Diary entry not found", 404, undefined, corsHeaders);
    }
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (diaryMatch && method === "DELETE") {
    const id = Number(diaryMatch[1]);
    const result = db.query(`DELETE FROM diary_entries WHERE id = ? AND user_id = ?`).run(id, userId);
    if (!result.changes) {
      return makeError("NOT_FOUND", "Diary entry not found", 404, undefined, corsHeaders);
    }
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/pain/options" && method === "GET") {
    return makeData(loadPainOptionsForUser(userId), 200, corsHeaders);
  }

  if (pathname === "/api/v1/pain/options/remove" && method === "POST") {
    const body = await parseJson(
      req,
      z.object({
        field: z.string(),
        value: z.string().min(1)
      })
    );
    if (!PAIN_MULTI_FIELDS.includes(body.field as PainMultiField)) {
      return makeError("INVALID_FIELD", "Unknown pain field", 400, undefined, corsHeaders);
    }
    const field = body.field as PainMultiField;
    const normalizedValue = body.value.trim();
    if (!normalizedValue) {
      return makeError("INVALID_VALUE", "Value must not be empty", 400, undefined, corsHeaders);
    }

    db.query(
      `DELETE FROM pain_options WHERE user_id = ? AND field = ? AND value = ?`
    ).run(userId, field, normalizedValue);

    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/pain/options/restore" && method === "POST") {
    const body = await parseJson(
      req,
      z.object({
        field: z.string(),
        value: z.string().min(1)
      })
    );
    if (!PAIN_MULTI_FIELDS.includes(body.field as PainMultiField)) {
      return makeError("INVALID_FIELD", "Unknown pain field", 400, undefined, corsHeaders);
    }
    const field = body.field as PainMultiField;
    const normalizedValue = body.value.trim();
    if (!normalizedValue) {
      return makeError("INVALID_VALUE", "Value must not be empty", 400, undefined, corsHeaders);
    }

    db.query(
      `INSERT OR IGNORE INTO pain_options (user_id, field, value) VALUES (?, ?, ?)`
    ).run(userId, field, normalizedValue);

    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/mood/options" && method === "GET") {
    return makeData(loadMoodOptionsForUser(userId), 200, corsHeaders);
  }

  if (pathname === "/api/v1/mood/options/remove" && method === "POST") {
    const body = await parseJson(
      req,
      z.object({
        field: z.string(),
        value: z.string().min(1)
      })
    );
    if (!MOOD_MULTI_FIELDS.includes(body.field as MoodMultiField)) {
      return makeError("INVALID_FIELD", "Unknown mood field", 400, undefined, corsHeaders);
    }
    const field = body.field as MoodMultiField;
    const normalizedValue = body.value.trim();
    if (!normalizedValue) {
      return makeError("INVALID_VALUE", "Value must not be empty", 400, undefined, corsHeaders);
    }

    db.query(
      `DELETE FROM mood_options WHERE user_id = ? AND field = ? AND value = ?`
    ).run(userId, field, normalizedValue);

    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/mood/options/restore" && method === "POST") {
    const body = await parseJson(
      req,
      z.object({
        field: z.string(),
        value: z.string().min(1)
      })
    );
    if (!MOOD_MULTI_FIELDS.includes(body.field as MoodMultiField)) {
      return makeError("INVALID_FIELD", "Unknown mood field", 400, undefined, corsHeaders);
    }
    const field = body.field as MoodMultiField;
    const normalizedValue = body.value.trim();
    if (!normalizedValue) {
      return makeError("INVALID_VALUE", "Value must not be empty", 400, undefined, corsHeaders);
    }

    db.query(
      `INSERT OR IGNORE INTO mood_options (user_id, field, value) VALUES (?, ?, ?)`
    ).run(userId, field, normalizedValue);

    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/pain" && method === "GET") {
    const rows = db
      .query(`SELECT * FROM pain_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC, id DESC`)
      .all(userId) as any[];
    return makeData(rows.map((row) => painRowToApi(row)), 200, corsHeaders);
  }

  if (pathname === "/api/v1/pain" && method === "POST") {
    const body = await parseJson(req, painSchema);
    const result = db
      .query(
        `INSERT INTO pain_entries (user_id, entry_date, entry_time, pain_level, fatigue_level, coffee_count, area, symptoms, activities, medicines, habits, other, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        body.entryDate,
        body.entryTime,
        toNullableInt(body.painLevel),
        toNullableInt(body.fatigueLevel),
        toNullableInt(body.coffeeCount),
        extractPainField(body, "area"),
        extractPainField(body, "symptoms"),
        extractPainField(body, "activities"),
        extractPainField(body, "medicines"),
        extractPainField(body, "habits"),
        extractPainField(body, "other"),
        body.note ?? ""
      );
    return makeData({ id: Number(result.lastInsertRowid) }, 201, corsHeaders);
  }

  const painMatch = pathname.match(/^\/api\/v1\/pain\/(\d+)$/);
  if (painMatch && method === "PUT") {
    const id = Number(painMatch[1]);
    const body = await parseJson(req, painSchema);
    const result = db
      .query(
        `UPDATE pain_entries
         SET entry_date = ?, entry_time = ?, pain_level = ?, fatigue_level = ?, coffee_count = ?, area = ?, symptoms = ?, activities = ?, medicines = ?, habits = ?, other = ?, note = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`
      )
      .run(
        body.entryDate,
        body.entryTime,
        toNullableInt(body.painLevel),
        toNullableInt(body.fatigueLevel),
        toNullableInt(body.coffeeCount),
        extractPainField(body, "area"),
        extractPainField(body, "symptoms"),
        extractPainField(body, "activities"),
        extractPainField(body, "medicines"),
        extractPainField(body, "habits"),
        extractPainField(body, "other"),
        body.note ?? "",
        id,
        userId
      );
    if (!result.changes) {
      return makeError("NOT_FOUND", "Pain entry not found", 404, undefined, corsHeaders);
    }
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (painMatch && method === "DELETE") {
    const id = Number(painMatch[1]);
    const result = db.query(`DELETE FROM pain_entries WHERE id = ? AND user_id = ?`).run(id, userId);
    if (!result.changes) {
      return makeError("NOT_FOUND", "Pain entry not found", 404, undefined, corsHeaders);
    }
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/preferences" && method === "GET") {
    const row = db
      .query(
        `SELECT model, chat_range, last_range, graph_selection_json, updated_at FROM user_preferences WHERE user_id = ? LIMIT 1`
      )
      .get(userId) as any;

    if (!row) {
      return makeData(
        {
          model: "mistral-small-latest",
          chatRange: "all",
          lastRange: "all",
          graphSelection: {}
        },
        200,
        corsHeaders
      );
    }

    let graphSelection = {};
    try {
      graphSelection = JSON.parse(row.graph_selection_json || "{}");
    } catch {
      graphSelection = {};
    }

    return makeData(
      {
        model: row.model,
        chatRange: row.chat_range,
        lastRange: row.last_range,
        graphSelection,
        updatedAt: row.updated_at
      },
      200,
      corsHeaders
    );
  }

  if (pathname === "/api/v1/preferences" && method === "PUT") {
    const body = await parseJson(req, prefsSchema);
    db.query(
      `INSERT INTO user_preferences (user_id, model, chat_range, last_range, graph_selection_json, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
        model=excluded.model,
        chat_range=excluded.chat_range,
        last_range=excluded.last_range,
        graph_selection_json=excluded.graph_selection_json,
        updated_at=CURRENT_TIMESTAMP`
    ).run(userId, body.model, body.chatRange, body.lastRange, JSON.stringify(body.graphSelection ?? {}));

    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/ai/key" && method === "GET") {
    const row = db
      .query(`SELECT mistral_api_key, updated_at FROM user_ai_settings WHERE user_id = ? LIMIT 1`)
      .get(userId) as any;
    if (!row?.mistral_api_key) {
      return makeData({ hasKey: false }, 200, corsHeaders);
    }
    const key = String(row.mistral_api_key);
    return makeData(
      {
        hasKey: true,
        last4: key.length >= 4 ? key.slice(-4) : "",
        updatedAt: row.updated_at
      },
      200,
      corsHeaders
    );
  }

  if (pathname === "/api/v1/ai/key" && method === "PUT") {
    const body = await parseJson(req, aiKeySchema);
    db.query(
      `INSERT INTO user_ai_settings (user_id, mistral_api_key, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET mistral_api_key=excluded.mistral_api_key, updated_at=CURRENT_TIMESTAMP`
    ).run(userId, body.key);

    return makeData({ hasKey: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/ai/key" && method === "DELETE") {
    db.query(`UPDATE user_ai_settings SET mistral_api_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(userId);
    return makeData({ hasKey: false }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/ai/chat" && method === "POST") {
    const body = await parseJson(req, chatSchema);
    const row = db.query(`SELECT mistral_api_key FROM user_ai_settings WHERE user_id = ? LIMIT 1`).get(userId) as any;
    const apiKey = row?.mistral_api_key;
    if (!apiKey) {
      return makeError("NO_AI_KEY", "No Mistral key configured", 400, undefined, corsHeaders);
    }

    const range = normalizeRange(body.range);
    const model = normalizeModel(body.model);

    let diaryRows: any[];
    let painRows: any[];

    if (range === "all") {
      diaryRows = db
        .query(`SELECT * FROM diary_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC LIMIT 250`)
        .all(userId) as any[];
      painRows = db
        .query(`SELECT * FROM pain_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC LIMIT 250`)
        .all(userId) as any[];
    } else {
      const cutoff = new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      diaryRows = db
        .query(
          `SELECT * FROM diary_entries WHERE user_id = ? AND entry_date >= ? ORDER BY entry_date DESC, entry_time DESC LIMIT 250`
        )
        .all(userId, cutoff) as any[];
      painRows = db
        .query(
          `SELECT * FROM pain_entries WHERE user_id = ? AND entry_date >= ? ORDER BY entry_date DESC, entry_time DESC LIMIT 250`
        )
        .all(userId, cutoff) as any[];
    }

    const diaryContext = diaryRows
      .map(
        (entry) =>
          `${entry.entry_date} ${entry.entry_time} mood=${entry.mood_level ?? ""} dep=${entry.depression_level ?? ""} anx=${entry.anxiety_level ?? ""} desc=${entry.description ?? ""} refl=${entry.reflection ?? ""}`
      )
      .join("\n");

    const painContext = painRows
      .map(
        (entry) =>
          `${entry.entry_date} ${entry.entry_time} pain=${entry.pain_level ?? ""} fatigue=${entry.fatigue_level ?? ""} coffee=${entry.coffee_count ?? ""} area=${entry.area ?? ""} symptoms=${entry.symptoms ?? ""} note=${entry.note ?? ""}`
      )
      .join("\n");

    const prompt = `Context diary entries:\n${diaryContext || "(none)"}\n\nContext pain entries:\n${painContext || "(none)"}\n\nQuestion:\n${body.message}`;

    try {
      const reply = await callMistral(apiKey, prompt, model);
      return makeData(
        {
          reply,
          modelUsed: model,
          context: { diaryRows: diaryRows.length, painRows: painRows.length }
        },
        200,
        corsHeaders
      );
    } catch (error: any) {
      const fallback = `AI unavailable: ${error?.message ?? "unknown error"}\nDiary rows considered: ${diaryRows.length}. Pain rows considered: ${painRows.length}.`;
      return makeData({ reply: fallback, fallback: true }, 200, corsHeaders);
    }
  }

  if (pathname === "/api/v1/backup/json" && method === "GET") {
    const diaryRows = db
      .query(`SELECT * FROM diary_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC`)
      .all(userId) as any[];
    const painRows = db
      .query(`SELECT * FROM pain_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC`)
      .all(userId) as any[];

    const prefs = db
      .query(`SELECT model, chat_range, last_range, graph_selection_json FROM user_preferences WHERE user_id = ? LIMIT 1`)
      .get(userId) as any;

    const backup = rowsToHealthBackup(diaryRows, painRows);

    const removedRows = db
      .query(`SELECT field, value FROM pain_removed_options WHERE user_id = ?`)
      .all(userId) as Array<{ field: string; value: string }>;
    const removedMap: Record<PainMultiField, string[]> = {
      area: [],
      symptoms: [],
      activities: [],
      medicines: [],
      habits: [],
      other: []
    };
    for (const row of removedRows) {
      if (!PAIN_MULTI_FIELDS.includes(row.field as PainMultiField)) continue;
      const field = row.field as PainMultiField;
      removedMap[field] = mergeOptions(removedMap[field], [row.value]);
    }

    return makeData(
      {
        diary: { ...backup.diary, moodOptions: loadMoodOptionsForUser(userId) },
        pain: { ...backup.pain, options: { options: loadPainOptionsForUser(userId), removed: removedMap } },
        prefs: {
          model: prefs?.model ?? "mistral-small-latest",
          chatRange: prefs?.chat_range ?? "all",
          lastRange: prefs?.last_range ?? "all",
          graphSelection: prefs?.graph_selection_json ? JSON.parse(prefs.graph_selection_json) : {}
        }
      },
      200,
      corsHeaders
    );
  }

  if (pathname === "/api/v1/backup/json/import" && method === "POST") {
    const body = await parseJson(req, backupImportSchema);

    const tx = db.transaction(() => {
      db.query(`DELETE FROM pain_entries WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM diary_entries WHERE user_id = ?`).run(userId);

      if (body.diary?.rows) {
        const insertDiary = db.query(
          `INSERT INTO diary_entries (user_id, entry_date, entry_time, mood_level, depression_level, anxiety_level, positive_moods, negative_moods, general_moods, description, gratitude, reflection)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const row of body.diary.rows) {
          insertDiary.run(
            userId,
            String(row.date ?? row.entryDate ?? ""),
            String(row.hour ?? row.entryTime ?? "00:00"),
            toNullableNumber(row["mood level"] ?? row.moodLevel),
            toNullableNumber(row.depression ?? row.depressionLevel),
            toNullableNumber(row.anxiety ?? row.anxietyLevel),
            String(row["positive moods"] ?? row.positiveMoods ?? ""),
            String(row["negative moods"] ?? row.negativeMoods ?? ""),
            String(row["general moods"] ?? row.generalMoods ?? ""),
            String(row.description ?? ""),
            String(row.gratitude ?? ""),
            String(row.reflection ?? "")
          );
        }
      }

      if (body.pain?.rows) {
        const insertPain = db.query(
          `INSERT INTO pain_entries (user_id, entry_date, entry_time, pain_level, fatigue_level, coffee_count, area, symptoms, activities, medicines, habits, other, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const row of body.pain.rows) {
          insertPain.run(
            userId,
            String(row.date ?? row.entryDate ?? ""),
            String(row.hour ?? row.entryTime ?? "00:00"),
            toNullableInt(row["pain level"] ?? row.painLevel),
            toNullableInt(row["fatigue level"] ?? row.fatigueLevel),
            toNullableInt(row.coffee ?? row.coffeeCount),
            rowPainField(row, "area"),
            rowPainField(row, "symptoms"),
            rowPainField(row, "activities"),
            rowPainField(row, "medicines"),
            rowPainField(row, "habits"),
            rowPainField(row, "other"),
            String(row.note ?? "")
          );
        }
      }

      db.query(`DELETE FROM pain_removed_options WHERE user_id = ?`).run(userId);
      const removed = body.pain?.options?.removed;
      if (removed && typeof removed === "object") {
        const insertRemoved = db.query(
          `INSERT INTO pain_removed_options (user_id, field, value)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id, field, value) DO NOTHING`
        );
        for (const field of PAIN_MULTI_FIELDS) {
          const values = (removed as any)[field];
          if (!Array.isArray(values)) continue;
          for (const raw of values) {
            const normalized = String(raw).trim();
            if (!normalized) continue;
            insertRemoved.run(userId, field, normalized);
          }
        }
      }

      if (body.prefs) {
        const pref = prefsSchema.parse(body.prefs);
        db.query(
          `INSERT INTO user_preferences (user_id, model, chat_range, last_range, graph_selection_json, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
            model=excluded.model,
            chat_range=excluded.chat_range,
            last_range=excluded.last_range,
            graph_selection_json=excluded.graph_selection_json,
            updated_at=CURRENT_TIMESTAMP`
        ).run(userId, pref.model, pref.chatRange, pref.lastRange, JSON.stringify(pref.graphSelection ?? {}));
      }
    });

    tx();
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/backup/xlsx" && method === "GET") {
    const diaryRows = db
      .query(`SELECT * FROM diary_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC`)
      .all(userId) as any[];
    const painRows = db
      .query(`SELECT * FROM pain_entries WHERE user_id = ? ORDER BY entry_date DESC, entry_time DESC`)
      .all(userId) as any[];

    const backup = rowsToHealthBackup(diaryRows, painRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(backup.diary.rows), "diary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(backup.pain.rows), "pain");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const headers = new Headers(corsHeaders);
    headers.set("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    headers.set("content-disposition", `attachment; filename="health-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return new Response(buffer, { status: 200, headers });
  }

  if (pathname === "/api/v1/backup/xlsx/import" && method === "POST") {
    let workbook: XLSX.WorkBook;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return makeError("MISSING_FILE", "Missing uploaded file in 'file' field", 400, undefined, corsHeaders);
      }
      const arrayBuffer = await file.arrayBuffer();
      workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
    } else {
      const payload = (await req.json().catch(() => null)) as any;
      if (!payload?.base64 || typeof payload.base64 !== "string") {
        return makeError("MISSING_FILE", "Expected multipart form upload or JSON {base64}", 400, undefined, corsHeaders);
      }
      workbook = XLSX.read(Buffer.from(payload.base64, "base64"), { type: "buffer" });
    }

    const diarySheet = workbook.Sheets.diary;
    const painSheet = workbook.Sheets.pain;

    const diaryRows = diarySheet ? (XLSX.utils.sheet_to_json(diarySheet) as any[]) : [];
    const painRows = painSheet ? (XLSX.utils.sheet_to_json(painSheet) as any[]) : [];

    const tx = db.transaction(() => {
      db.query(`DELETE FROM pain_entries WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM diary_entries WHERE user_id = ?`).run(userId);

      const insertDiary = db.query(
        `INSERT INTO diary_entries (user_id, entry_date, entry_time, mood_level, depression_level, anxiety_level, description, gratitude, reflection, positive_moods, negative_moods, general_moods)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const row of diaryRows) {
        insertDiary.run(
          userId,
          String(row.date ?? ""),
          String(row.hour ?? "00:00"),
          toNullableNumber(row["mood level"]),
          toNullableNumber(row.depression),
          toNullableNumber(row.anxiety),
          String(row.description ?? ""),
          String(row.gratitude ?? ""),
          String(row.reflection ?? ""),
          String(row["positive moods"] ?? row.positive_moods ?? ""),
          String(row["negative moods"] ?? row.negative_moods ?? ""),
          String(row["general moods"] ?? row.general_moods ?? "")
        );
      }

      const insertPain = db.query(
        `INSERT INTO pain_entries (user_id, entry_date, entry_time, pain_level, fatigue_level, coffee_count, area, symptoms, activities, medicines, habits, other, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const row of painRows) {
        insertPain.run(
          userId,
          String(row.date ?? ""),
          String(row.hour ?? "00:00"),
          toNullableInt(row["pain level"]),
          toNullableInt(row["fatigue level"]),
          toNullableInt(row.coffee),
          rowPainField(row, "area"),
          rowPainField(row, "symptoms"),
          rowPainField(row, "activities"),
          rowPainField(row, "medicines"),
          rowPainField(row, "habits"),
          rowPainField(row, "other"),
          String(row.note ?? "")
        );
      }
    });

    tx();
    return makeData({ ok: true, imported: { diaryRows: diaryRows.length, painRows: painRows.length } }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/data/purge" && method === "POST") {
    const tx = db.transaction(() => {
      db.query(`DELETE FROM pain_entries WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM diary_entries WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(userId);
    });
    tx();
    return makeData({ ok: true }, 200, corsHeaders);
  }

  return makeError("NOT_FOUND", "Route not found", 404, undefined, corsHeaders);
}

function resolveStaticFile(publicDir: string, requestPath: string): string | null {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const unsafePath = path.resolve(publicDir, `.${normalized}`);
  const safeRoot = path.resolve(publicDir);
  if (!unsafePath.startsWith(safeRoot)) return null;
  if (fs.existsSync(unsafePath) && fs.statSync(unsafePath).isFile()) {
    return unsafePath;
  }
  return null;
}

const server = Bun.serve({
  hostname: env.HOST,
  port: env.PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const cors = getCorsHeaders(req);
    if (cors instanceof Response) return cors;

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(req, url, cors);
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        return makeError("METHOD_NOT_ALLOWED", "Method not allowed", 405, undefined, cors);
      }

      if (
        url.pathname === "/hub" ||
        url.pathname.startsWith("/hub/") ||
        url.pathname === "/myhealth" ||
        url.pathname.startsWith("/myhealth/") ||
        url.pathname === "/health" ||
        url.pathname.startsWith("/health/") ||
        url.pathname === "/mymoney" ||
        url.pathname.startsWith("/mymoney/")
      ) {
        return makeError("NOT_FOUND", "Route not found", 404, undefined, cors);
      }

      const staticFile = resolveStaticFile(env.PUBLIC_DIR, url.pathname);
      if (staticFile) {
        return new Response(Bun.file(staticFile), { headers: cors });
      }

      const indexFile = path.resolve(env.PUBLIC_DIR, "index.html");
      if (fs.existsSync(indexFile)) {
        return new Response(Bun.file(indexFile), { headers: cors });
      }

      return new Response("Health backend running. Frontend build not found.", {
        status: 200,
        headers: cors
      });
    } catch (error: any) {
      console.error(error);
      if (error instanceof Response) {
        return error;
      }
      return makeError("INTERNAL_ERROR", error?.message ?? "Internal server error", 500, undefined, cors);
    }
  }
});

console.log(`Health backend listening on http://${env.HOST}:${server.port}`);
