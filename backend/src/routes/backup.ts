import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import * as XLSX from "xlsx";
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
  }).from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1).get();

  // Map Drizzle rows to the format rowsToHealthBackup expects (snake_case)
  const diaryForBackup = diaryRows.map((r) => ({
    entry_date: r.entryDate, entry_time: r.entryTime,
    mood_level: r.moodLevel, depression_level: r.depressionLevel, anxiety_level: r.anxietyLevel,
    positive_moods: r.positiveMoods, negative_moods: r.negativeMoods, general_moods: r.generalMoods,
    description: r.description, gratitude: r.gratitude, reflection: r.reflection,
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
        graphSelection: prefs?.graphSelectionJson ? JSON.parse(prefs.graphSelectionJson) : {}
      }
    }
  });
});

// JSON import and XLSX routes use rawDb for transactions (bulk ops with prepared statements)
backup.post("/json/import", async (c) => {
  const rawDb = c.get("rawDb");
  const userId = c.get("userId");
  const body = await parseJson(c, backupImportSchema);

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
      rawDb.query(
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
  return c.json({ data: { ok: true } });
});

backup.get("/xlsx", (c) => {
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
    description: r.description, gratitude: r.gratitude, reflection: r.reflection,
  }));
  const painForBackup = painRows.map((r) => ({
    entry_date: r.entryDate, entry_time: r.entryTime,
    pain_level: r.painLevel, fatigue_level: r.fatigueLevel, coffee_count: r.coffeeCount,
    symptoms: r.symptoms, area: r.area, activities: r.activities,
    habits: r.habits, other: r.other, medicines: r.medicines, note: r.note,
  }));

  const result = rowsToHealthBackup(diaryForBackup, painForBackup);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.diary.rows), "diary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(result.pain.rows), "pain");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(buffer, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="health-${new Date().toISOString().slice(0, 10)}.xlsx"`
    }
  });
});

backup.post("/xlsx/import", async (c) => {
  const rawDb = c.get("rawDb");
  const userId = c.get("userId");

  let workbook: XLSX.WorkBook;
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: { code: "MISSING_FILE", message: "Missing uploaded file in 'file' field" } }, 400);
    }
    const arrayBuffer = await file.arrayBuffer();
    workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
  } else {
    const payload = (await c.req.json().catch(() => null)) as any;
    if (!payload?.base64 || typeof payload.base64 !== "string") {
      return c.json({ error: { code: "MISSING_FILE", message: "Expected multipart form upload or JSON {base64}" } }, 400);
    }
    workbook = XLSX.read(Buffer.from(payload.base64, "base64"), { type: "buffer" });
  }

  const diarySheet = workbook.Sheets.diary;
  const painSheet = workbook.Sheets.pain;
  const diaryRows = diarySheet ? (XLSX.utils.sheet_to_json(diarySheet) as any[]) : [];
  const painRows = painSheet ? (XLSX.utils.sheet_to_json(painSheet) as any[]) : [];

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
    rawDb.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(userId);
  });
  tx();
  return c.json({ data: { ok: true } });
});

export default backup;
