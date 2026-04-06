import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";
import * as schema from "./drizzle-schema.ts";

export type DrizzleDB = ReturnType<typeof createDrizzle>;

export function createDrizzle(sqliteDb: Database) {
  return drizzle(sqliteDb, { schema });
}

// Re-export schema for convenience
export {
  users,
  diaryEntries,
  painEntries,
  userPreferences,
  appMeta,
  sessions,
  cbtEntries,
  dbtEntries,
  painRemovedOptions,
  painOptions,
  moodOptions,
  moodRemovedOptions,
  mcpTokens
} from "./drizzle-schema.ts";
