import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { openDb, runMigrations, toNullableInt, toNullableNumber } from "./db.ts";
import { TAG_TYPES, type TagType } from "./schema.ts";

type Args = {
  source: string;
  target: string;
  primaryEmail: string;
  fresh: boolean;
  report: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (key: string, fallback: string) => {
    const pref = `--${key}=`;
    const hit = args.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : fallback;
  };
  const fresh = args.includes("--fresh");
  const source = get("source", path.resolve(process.cwd(), "../data/mytools.sqlite"));
  const target = get("target", process.env.DB_PATH || path.resolve(process.cwd(), "../data/health.sqlite"));
  const primaryEmail = get("primary-email", process.env.MIGRATION_PRIMARY_EMAIL || "").trim();
  const report = get("report", path.resolve(process.cwd(), "../data/health-migration-report.json"));
  if (!primaryEmail) {
    throw new Error("Missing primary email. Use --primary-email=... or MIGRATION_PRIMARY_EMAIL.");
  }
  return { source, target, primaryEmail, fresh, report };
}

function toCsvField(raw: unknown): string {
  if (raw === null || raw === undefined) return "";

  const values = Array.isArray(raw)
    ? raw.map((value) => String(value).trim())
    : String(raw)
        .split(/(?<!\d),(?!\d)/)
        .map((value) => value.trim());

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(value);
  }

  return deduped.join(", ");
}

function readSourceJson(db: Database, name: string): any | null {
  const row = db.query(`SELECT data FROM files WHERE name = ? LIMIT 1`).get(name) as any;
  if (!row?.data) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

function legacyPainValue(row: Record<string, unknown>, key: TagType): string {
  if (row[key] !== undefined) {
    return toCsvField(row[key]);
  }

  const legacyTags = row.tags;
  if (legacyTags && typeof legacyTags === "object") {
    const candidate = (legacyTags as Record<string, unknown>)[key];
    return toCsvField(candidate);
  }

  return "";
}

function main() {
  const cfg = parseArgs();

  if (!fs.existsSync(cfg.source)) {
    throw new Error(`Source DB not found: ${cfg.source}`);
  }

  fs.mkdirSync(path.dirname(cfg.target), { recursive: true });
  if (cfg.fresh && fs.existsSync(cfg.target)) {
    fs.rmSync(cfg.target, { force: true });
  }

  const source = new Database(cfg.source, { readonly: true });
  const target = openDb(cfg.target);
  runMigrations(target);

  const users = source.query(`SELECT id, email, password_hash, name, created_at, updated_at FROM users ORDER BY id ASC`).all() as any[];
  const primary = users.find((u) => String(u.email).toLowerCase() === cfg.primaryEmail.toLowerCase());
  if (!primary) {
    throw new Error(`Primary email ${cfg.primaryEmail} not found in source users table.`);
  }

  const diary = readSourceJson(source, "diary.json");
  const pain = readSourceJson(source, "pain.json");
  const prefs = readSourceJson(source, "prefs.json") || {};

  const report: Record<string, unknown> = {
    source: cfg.source,
    target: cfg.target,
    primaryEmail: cfg.primaryEmail,
    migratedAt: new Date().toISOString(),
    usersCopied: 0,
    diaryRows: 0,
    painRows: 0,
    aiKeys: 0
  };

  const tx = target.transaction(() => {
    const upsertUser = target.query(
      `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(id) DO UPDATE SET
        email=excluded.email,
        password_hash=excluded.password_hash,
        name=excluded.name,
        updated_at=COALESCE(excluded.updated_at, CURRENT_TIMESTAMP)`
    );

    for (const user of users) {
      upsertUser.run(user.id, user.email, user.password_hash, user.name ?? null, user.created_at ?? null, user.updated_at ?? null);
    }

    target.query(`DELETE FROM pain_entries WHERE user_id = ?`).run(primary.id);
    target.query(`DELETE FROM diary_entries WHERE user_id = ?`).run(primary.id);
    target.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(primary.id);

    if (diary?.rows && Array.isArray(diary.rows)) {
      const insertDiary = target.query(
        `INSERT INTO diary_entries (user_id, entry_date, entry_time, mood_level, depression_level, anxiety_level, description, gratitude, reflection)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const row of diary.rows) {
        insertDiary.run(
          primary.id,
          String(row.date ?? ""),
          String(row.hour ?? "00:00"),
          toNullableNumber(row["mood level"]),
          toNullableNumber(row.depression),
          toNullableNumber(row.anxiety),
          String(row.description ?? ""),
          String(row.gratitude ?? ""),
          String(row.reflection ?? "")
        );
      }
      report.diaryRows = diary.rows.length;
    }

    if (pain?.rows && Array.isArray(pain.rows)) {
      const insertPain = target.query(
        `INSERT INTO pain_entries (user_id, entry_date, entry_time, pain_level, fatigue_level, coffee_count, area, symptoms, activities, medicines, habits, other, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const row of pain.rows) {
        insertPain.run(
          primary.id,
          String(row.date ?? ""),
          String(row.hour ?? "00:00"),
          toNullableInt(row["pain level"] ?? row.painLevel),
          toNullableInt(row["fatigue level"] ?? row.fatigueLevel),
          toNullableInt(row.coffee ?? row.coffeeCount),
          legacyPainValue(row, "area"),
          legacyPainValue(row, "symptoms"),
          legacyPainValue(row, "activities"),
          legacyPainValue(row, "medicines"),
          legacyPainValue(row, "habits"),
          legacyPainValue(row, "other"),
          String(row.note ?? "")
        );
      }
      report.painRows = pain.rows.length;
    }

    target
      .query(
        `INSERT OR REPLACE INTO user_preferences (user_id, model, chat_range, last_range, graph_selection_json, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(
        primary.id,
        String(prefs.model ?? "mistral-small-latest"),
        String(prefs.chatRange ?? "all"),
        String(prefs.lastRange ?? "all"),
        JSON.stringify(prefs.graphSelection ?? {})
      );

    const settingsRows = source.query(`SELECT user_id, gemini_key FROM user_settings`).all() as any[];
    const upsertAi = target.query(
      `INSERT INTO user_ai_settings (user_id, mistral_api_key, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET mistral_api_key=excluded.mistral_api_key, updated_at=CURRENT_TIMESTAMP`
    );
    let aiKeys = 0;
    for (const row of settingsRows) {
      if (!row.gemini_key) continue;
      const exists = users.some((u) => Number(u.id) === Number(row.user_id));
      if (!exists) continue;
      upsertAi.run(row.user_id, String(row.gemini_key));
      aiKeys += 1;
    }
    report.aiKeys = aiKeys;

    report.usersCopied = users.length;
  });

  tx();

  fs.mkdirSync(path.dirname(cfg.report), { recursive: true });
  fs.writeFileSync(cfg.report, JSON.stringify(report, null, 2));

  source.close();
  target.close();

  console.log(`Migration complete. Report written to ${cfg.report}`);
}

main();
