import { Database } from "bun:sqlite";
import { migrationStatements, MOOD_TAG_FIELDS, SCHEMA_VERSION, TAG_TYPES } from "./schema.ts";

export type SQLiteDB = Database;

const legacyIndexes = ["idx_pain_tags_entry", "idx_pain_catalog_user"];

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

export function openDb(dbPath: string): SQLiteDB {
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
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
