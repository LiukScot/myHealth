import { Database } from "bun:sqlite";
import { migrationStatements, MOOD_TAG_FIELDS, SCHEMA_VERSION, TAG_TYPES } from "./schema.ts";

export type SQLiteDB = Database;

const legacyIndexes = ["idx_pain_tags_entry", "idx_pain_catalog_user"];
const SQLITE_JOURNAL_MODES = new Set(["DELETE", "TRUNCATE", "PERSIST", "MEMORY", "WAL", "OFF"]);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function tableExists(db: SQLiteDB, tableName: string): boolean {
  const row = db
    .query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName) as { name?: string } | null;
  return Boolean(row?.name);
}

const ALLOWED_TABLE_NAMES = new Set(["diary_entries", "pain_entries"]);

function columnExists(db: SQLiteDB, tableName: string, columnName: string): boolean {
  if (!ALLOWED_TABLE_NAMES.has(tableName)) {
    throw new Error(`columnExists: disallowed table name "${tableName}"`);
  }
  const rows = db.query(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function ensureMoodColumns(db: SQLiteDB): void {
  for (const column of MOOD_TAG_FIELDS) {
    if (columnExists(db, "diary_entries", column)) {
      continue;
    }
    db.exec(`ALTER TABLE diary_entries ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
}

function ensurePainColumns(db: SQLiteDB): void {
  for (const column of TAG_TYPES) {
    if (columnExists(db, "pain_entries", column)) {
      continue;
    }
    db.exec(`ALTER TABLE pain_entries ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
}

function backfillPainColumnsFromLegacyTags(db: SQLiteDB): void {
  if (!tableExists(db, "pain_entry_tags")) {
    return;
  }

  for (const column of TAG_TYPES) {
    db
      .query(
        `UPDATE pain_entries
         SET ${column} = COALESCE(
           (
             SELECT GROUP_CONCAT(tag_value, ', ')
             FROM (
               SELECT tag_value
               FROM pain_entry_tags
               WHERE pain_entry_id = pain_entries.id AND tag_type = ?
               ORDER BY position ASC, id ASC
             ) ordered_tags
           ),
           ''
         )
         WHERE ${column} IS NULL OR TRIM(${column}) = ''`
      )
      .run(column);
  }
}

function dropLegacyPainTables(db: SQLiteDB): void {
  for (const indexName of legacyIndexes) {
    db.exec(`DROP INDEX IF EXISTS ${indexName}`);
  }
  db.exec("DROP TABLE IF EXISTS pain_entry_tags");
  db.exec("DROP TABLE IF EXISTS pain_tag_catalog");
}

// Backfills FTS5 virtual tables with rows from their source tables.
// Idempotent: only runs if the FTS table is empty (i.e. just created by the migration).
// On a populated DB this is a no-op because the triggers keep FTS in sync going forward.
function backfillFtsTables(db: SQLiteDB): void {
  type CountRow = { c: number };

  const isEmpty = (ftsTable: string): boolean => {
    const row = db.query(`SELECT count(*) AS c FROM ${ftsTable}`).get() as CountRow | null;
    return (row?.c ?? 0) === 0;
  };

  if (isEmpty("diary_fts")) {
    db.exec(
      `INSERT INTO diary_fts(rowid, description, reflection)
       SELECT id, COALESCE(description, ''), COALESCE(reflection, '') FROM diary_entries`
    );
  }

  if (isEmpty("cbt_fts")) {
    db.exec(
      `INSERT INTO cbt_fts(rowid, situation, thoughts, helpful_reasoning, main_unhelpful_thought, effect_of_believing, evidence_for_against, alternative_explanation, worst_best_scenario, friend_advice, productive_response)
       SELECT id, situation, thoughts, helpful_reasoning, main_unhelpful_thought, effect_of_believing, evidence_for_against, alternative_explanation, worst_best_scenario, friend_advice, productive_response
       FROM cbt_entries`
    );
  }

  if (isEmpty("dbt_fts")) {
    db.exec(
      `INSERT INTO dbt_fts(rowid, emotion_name, allow_affirmation, watch_emotion, body_location, body_feeling, present_moment, emotion_returns)
       SELECT id, emotion_name, allow_affirmation, watch_emotion, body_location, body_feeling, present_moment, emotion_returns
       FROM dbt_entries`
    );
  }

  if (isEmpty("pain_fts")) {
    db.exec(
      `INSERT INTO pain_fts(rowid, note, symptoms)
       SELECT id, COALESCE(note, ''), COALESCE(symptoms, '') FROM pain_entries`
    );
  }
}

export function openDb(dbPath: string, journalMode = "WAL"): SQLiteDB {
  const db = new Database(dbPath);
  const normalizedJournalMode = journalMode.trim().toUpperCase();
  if (!SQLITE_JOURNAL_MODES.has(normalizedJournalMode)) {
    throw new Error(`Unsupported SQLite journal mode: ${journalMode}`);
  }
  db.exec(`PRAGMA journal_mode = ${normalizedJournalMode};`);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function runMigrations(db: SQLiteDB): void {
  const tx = db.transaction(() => {
    for (const stmt of migrationStatements) {
      db.exec(stmt);
    }

    ensurePainColumns(db);
    ensureMoodColumns(db);
    backfillPainColumnsFromLegacyTags(db);
    dropLegacyPainTables(db);
    backfillFtsTables(db);

    db.query(
      `INSERT INTO app_meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).run(String(SCHEMA_VERSION));
  });

  try {
    tx();
  } catch (error) {
    const message = getErrorMessage(error);
    throw new Error(`Migration failed: ${message}`);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clampInt(val: unknown, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function toNullableInt(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return n;
}
