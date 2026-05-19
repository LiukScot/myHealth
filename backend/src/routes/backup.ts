import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { DrizzleDB } from "../db/index.ts";
import { diaryEntries, painEntries, userPreferences, painRemovedOptions } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { toNullableInt, toNullableNumber } from "../db.ts";
import {
  parseJson,
  PAIN_MULTI_FIELDS,
  type PainMultiField,
  rowsToHealthBackup,
  rowPainField,
  mergeOptions,
} from "../helpers.ts";
import { backupImportSchema, prefsSchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";
import { loadPainOptionsForUser } from "./pain.ts";
import { loadMoodOptionsForUser } from "./mood.ts";

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const backup = new Hono<Env>();

backup.use(requireAuth);

// Normalize ExcelJS cell value to plain primitive matching the previous xlsx behavior.
// ExcelJS returns objects for richtext / hyperlink / formula and Date objects for date cells.
function cellToPrimitive(v: unknown): string | number | boolean | null {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.richText)) return (obj.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    if (typeof obj.text === "string") return obj.text;
    if (obj.result !== undefined) return cellToPrimitive(obj.result);
    if (typeof obj.hyperlink === "string") return (obj.text as string | undefined) ?? obj.hyperlink;
    return "";
  }
  return v as string | number | boolean;
}

function sheetToObjects(sheet: ExcelJS.Worksheet | undefined): Record<string, unknown>[] {
  if (!sheet) return [];
  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values as unknown[]; // ExcelJS row.values is 1-indexed
    if (rowNumber === 1) {
      for (let i = 1; i < values.length; i++) {
        headers[i - 1] = String(values[i] ?? "").trim();
      }
      return;
    }
    const obj: Record<string, unknown> = {};
    for (let i = 1; i < values.length; i++) {
      const key = headers[i - 1];
      if (!key) continue;
      obj[key] = cellToPrimitive(values[i]);
    }
    rows.push(obj);
  });
  return rows;
}

backup.get("/json", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");

  const diaryRows = db.select().from(diaryEntries).where(eq(diaryEntries.userId, userId))
    .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.entryTime)).all();
  const painRows = db.select().from(painEntries).where(eq(painEntries.userId, userId))
    .orderBy(desc(painEntries.entryDate), desc(painEntries.entryTime)).all();

  const prefs = db.select({
    model: userPreferences.model,
    chatRange: userPreferences.chatRange,
    lastRange: userPreferences.lastRange,
    graphSelectionJson: userPreferences.graphSelectionJson,
    birthday: userPreferences.birthday,
  }).from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1).get();

  // Map Drizzle rows to the format rowsToHealthBackup expects (snake_case)
  const diaryForBackup = diaryRows.map((r) => ({
    entry_date: r.entryDate, entry_time: r.entryTime,
    mood_level: r.moodLevel, depression_level: r.depressionLevel, anxiety_level: r.anxietyLevel,
    positive_moods: r.positiveMoods, negative_moods: r.negativeMoods, general_moods: r.generalMoods,
    description: r.description, gratitude: r.gratitude,
  }));
  const painForBackup = painRows.map((r) => ({
    entry_date: r.entryDate, entry_time: r.entryTime,
    pain_level: r.painLevel, fatigue_level: r.fatigueLevel, coffee_count: r.coffeeCount,
    symptoms: r.symptoms, area: r.area, activities: r.activities,
    habits: r.habits, other: r.other, medicines: r.medicines, note: r.note,
  }));

  const result = rowsToHealthBackup(diaryForBackup, painForBackup);

  const removedRows = db.select({ field: painRemovedOptions.field, value: painRemovedOptions.value })
    .from(painRemovedOptions).where(eq(painRemovedOptions.userId, userId)).all();
  const removedMap: Record<PainMultiField, string[]> = {
    area: [], symptoms: [], activities: [], medicines: [], habits: [], other: []
  };
  for (const row of removedRows) {
    if (!PAIN_MULTI_FIELDS.includes(row.field as PainMultiField)) continue;
    removedMap[row.field as PainMultiField] = mergeOptions(removedMap[row.field as PainMultiField], [row.value]);
  }

  return c.json({
    data: {
      diary: { ...result.diary, moodOptions: loadMoodOptionsForUser(db, userId) },
      pain: { ...result.pain, options: { options: loadPainOptionsForUser(db, userId), removed: removedMap } },
      prefs: {
        model: prefs?.model ?? "mistral-small-latest",
        chatRange: prefs?.chatRange ?? "all",
        lastRange: prefs?.lastRange ?? "all",
        graphSelection: (() => { try { return prefs?.graphSelectionJson ? JSON.parse(prefs.graphSelectionJson) : {}; } catch { return {}; } })(),
        birthday: prefs?.birthday ?? null,
      }
    }
  });
});

// JSON import and XLSX routes use rawDb for transactions (bulk ops with prepared statements)
backup.post("/json/import", async (c) => {
  const rawDb = c.get("rawDb");
  const userId = c.get("userId");
  const body = await parseJson(c, backupImportSchema);

  const parsedPrefs = body.prefs ? prefsSchema.safeParse(body.prefs) : null;
  if (parsedPrefs && !parsedPrefs.success) {
    return c.json({ error: { code: "INVALID_PREFS", message: "Invalid preferences in backup" } }, 400);
  }
  const pref = parsedPrefs?.data ?? null;

  const tx = rawDb.transaction(() => {
    rawDb.query(`DELETE FROM pain_entries WHERE user_id = ?`).run(userId);
    rawDb.query(`DELETE FROM diary_entries WHERE user_id = ?`).run(userId);

    if (body.diary?.rows) {
      const insertDiary = rawDb.query(
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
      const insertPain = rawDb.query(
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

    rawDb.query(`DELETE FROM pain_removed_options WHERE user_id = ?`).run(userId);
    const removed = body.pain?.options?.removed;
    if (removed && typeof removed === "object") {
      const insertRemoved = rawDb.query(
        `INSERT INTO pain_removed_options (user_id, field, value)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, field, value) DO NOTHING`
      );
      for (const field of PAIN_MULTI_FIELDS) {
        const values = (removed as Record<string, unknown>)[field];
        if (!Array.isArray(values)) continue;
        for (const raw of values) {
          const normalized = String(raw).trim();
          if (!normalized) continue;
          insertRemoved.run(userId, field, normalized);
        }
      }
    }

    if (pref) {
      rawDb.query(
        `INSERT INTO user_preferences (user_id, model, chat_range, last_range, graph_selection_json, birthday, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
          model=excluded.model,
          chat_range=excluded.chat_range,
          last_range=excluded.last_range,
          graph_selection_json=excluded.graph_selection_json,
          birthday=excluded.birthday,
          updated_at=CURRENT_TIMESTAMP`
      ).run(userId, pref.model, pref.chatRange, pref.lastRange, JSON.stringify(pref.graphSelection ?? {}), pref.birthday ?? null);
    }
  });

  tx();
  return c.json({ data: { ok: true } });
});

backup.get("/xlsx", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");

  const diaryRows = db.select().from(diaryEntries).where(eq(diaryEntries.userId, userId))
    .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.entryTime)).all();
  const painRows = db.select().from(painEntries).where(eq(painEntries.userId, userId))
    .orderBy(desc(painEntries.entryDate), desc(painEntries.entryTime)).all();

  const diaryForBackup = diaryRows.map((r) => ({
    entry_date: r.entryDate, entry_time: r.entryTime,
    mood_level: r.moodLevel, depression_level: r.depressionLevel, anxiety_level: r.anxietyLevel,
    positive_moods: r.positiveMoods, negative_moods: r.negativeMoods, general_moods: r.generalMoods,
    description: r.description, gratitude: r.gratitude,
  }));
  const painForBackup = painRows.map((r) => ({
    entry_date: r.entryDate, entry_time: r.entryTime,
    pain_level: r.painLevel, fatigue_level: r.fatigueLevel, coffee_count: r.coffeeCount,
    symptoms: r.symptoms, area: r.area, activities: r.activities,
    habits: r.habits, other: r.other, medicines: r.medicines, note: r.note,
  }));

  const result = rowsToHealthBackup(diaryForBackup, painForBackup);
  const workbook = new ExcelJS.Workbook();

  const diarySheet = workbook.addWorksheet("diary");
  diarySheet.columns = result.diary.headers.map((h: string) => ({ header: h, key: h }));
  for (const row of result.diary.rows) diarySheet.addRow(row);

  const painSheet = workbook.addWorksheet("pain");
  painSheet.columns = result.pain.headers.map((h: string) => ({ header: h, key: h }));
  for (const row of result.pain.rows) painSheet.addRow(row);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="health-${new Date().toISOString().slice(0, 10)}.xlsx"`
    }
  });
});

const XLSX_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
// base64 4 chars encode 3 raw bytes; pre-check string length before decode
const XLSX_UPLOAD_MAX_BASE64_CHARS = Math.ceil(XLSX_UPLOAD_MAX_BYTES / 3) * 4 + 4;
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream"
]);

backup.post("/xlsx/import", async (c) => {
  const rawDb = c.get("rawDb");
  const userId = c.get("userId");

  const workbook = new ExcelJS.Workbook();
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: { code: "MISSING_FILE", message: "Missing uploaded file in 'file' field" } }, 400);
    }
    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".xlsx") && !filename.endsWith(".xls")) {
      return c.json(
        { error: { code: "INVALID_FILE_TYPE", message: "Expected .xlsx or .xls upload" } },
        400
      );
    }
    if (file.type && !XLSX_MIME_TYPES.has(file.type)) {
      return c.json(
        { error: { code: "INVALID_FILE_TYPE", message: "Unsupported MIME type" } },
        400
      );
    }
    if (file.size > XLSX_UPLOAD_MAX_BYTES) {
      return c.json(
        { error: { code: "FILE_TOO_LARGE", message: "XLSX upload exceeds 10 MB limit" } },
        413
      );
    }
    const arrayBuffer = await file.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);
  } else {
    const payload = await c.req.json().catch(() => null);
    if (!payload || typeof payload !== "object" || !("base64" in payload) || typeof (payload as Record<string, unknown>).base64 !== "string") {
      return c.json({ error: { code: "MISSING_FILE", message: "Expected multipart form upload or JSON {base64}" } }, 400);
    }
    const base64 = (payload as Record<string, unknown>).base64 as string;
    if (base64.length > XLSX_UPLOAD_MAX_BASE64_CHARS) {
      return c.json(
        { error: { code: "FILE_TOO_LARGE", message: "XLSX upload exceeds 10 MB limit" } },
        413
      );
    }
    const decoded = Buffer.from(base64, "base64");
    if (decoded.byteLength > XLSX_UPLOAD_MAX_BYTES) {
      return c.json(
        { error: { code: "FILE_TOO_LARGE", message: "XLSX upload exceeds 10 MB limit" } },
        413
      );
    }
    try {
      await workbook.xlsx.load(decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength));
    } catch {
      return c.json({ error: { code: "INVALID_FILE", message: "Could not parse XLSX file" } }, 400);
    }
  }

  const diaryRows = sheetToObjects(workbook.getWorksheet("diary"));
  const painRows = sheetToObjects(workbook.getWorksheet("pain"));

  const tx = rawDb.transaction(() => {
    rawDb.query(`DELETE FROM pain_entries WHERE user_id = ?`).run(userId);
    rawDb.query(`DELETE FROM diary_entries WHERE user_id = ?`).run(userId);

    const insertDiary = rawDb.query(
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

    const insertPain = rawDb.query(
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
  return c.json({ data: { ok: true, imported: { diaryRows: diaryRows.length, painRows: painRows.length } } });
});

backup.post("/purge", async (c) => {
  const rawDb = c.get("rawDb");
  const userId = c.get("userId");
  const tx = rawDb.transaction(() => {
    rawDb.query(`DELETE FROM pain_entries WHERE user_id = ?`).run(userId);
    rawDb.query(`DELETE FROM diary_entries WHERE user_id = ?`).run(userId);
    rawDb.query(`DELETE FROM cbt_entries WHERE user_id = ?`).run(userId);
    rawDb.query(`DELETE FROM dbt_entries WHERE user_id = ?`).run(userId);
    rawDb.query(`DELETE FROM memorable_days WHERE user_id = ?`).run(userId);
    rawDb.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(userId);
  });
  tx();
  return c.json({ data: { ok: true } });
});

export default backup;
