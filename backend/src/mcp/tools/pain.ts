import { z } from "zod";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { painEntries, painOptions } from "../../db/index.ts";
import type { McpToolContext } from "../server.ts";
import { jsonContent, periodCutoff, sanitizeFtsQuery, escapeLike } from "./_shared.ts";

export function registerPainTools(server: McpServer, ctx: McpToolContext): void {
  const { db, rawDb, userId } = ctx;

  // ────────────────────────────────────────────────────────────────────
  // list_pain_entries
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "list_pain_entries",
    {
      title: "List pain entries",
      description:
        "Returns pain entries for the authenticated user, optionally filtered by date range, body area, minimum pain level, or symptom substring. Pain entries record pain level (0-10), fatigue, coffee count, body areas affected, symptoms, activities, medicines, habits, and free notes.",
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Inclusive start date (YYYY-MM-DD)."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Inclusive end date (YYYY-MM-DD)."),
        area: z.string().optional()
          .describe("Filter by body area substring (e.g. 'head', 'back'). Matches CSV-encoded area field."),
        level_min: z.number().int().min(0).max(10).optional()
          .describe("Minimum pain level (0-10, where 10 is worst)."),
        symptoms_contains: z.string().optional()
          .describe("Filter by symptoms substring."),
        limit: z.number().int().min(1).max(500).optional().default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const conditions = [eq(painEntries.userId, userId)];
      if (args.from) conditions.push(gte(painEntries.entryDate, args.from));
      if (args.to) conditions.push(lte(painEntries.entryDate, args.to));
      if (args.level_min !== undefined) conditions.push(gte(painEntries.painLevel, args.level_min));
      if (args.area) conditions.push(sql`${painEntries.area} LIKE ${'%' + escapeLike(args.area) + '%'} ESCAPE '\\'`);
      if (args.symptoms_contains) conditions.push(sql`${painEntries.symptoms} LIKE ${'%' + escapeLike(args.symptoms_contains) + '%'} ESCAPE '\\'`);

      const rows = db
        .select({
          id: painEntries.id,
          entryDate: painEntries.entryDate,
          entryTime: painEntries.entryTime,
          painLevel: painEntries.painLevel,
          fatigueLevel: painEntries.fatigueLevel,
          coffeeCount: painEntries.coffeeCount,
          area: painEntries.area,
          symptoms: painEntries.symptoms,
          activities: painEntries.activities,
          medicines: painEntries.medicines,
          habits: painEntries.habits,
          other: painEntries.other,
          note: painEntries.note,
        })
        .from(painEntries)
        .where(and(...conditions))
        .orderBy(desc(painEntries.entryDate), desc(painEntries.entryTime), desc(painEntries.id))
        .limit(args.limit ?? 50)
        .all();

      return jsonContent({ count: rows.length, entries: rows });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // search_pain (FTS5 over note + symptoms)
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "search_pain",
    {
      title: "Full-text search pain entries",
      description:
        "Searches the note and symptoms fields of pain entries using SQLite FTS5. Use this when looking for specific words in free-text fields rather than filtering by structured columns. Case- and accent-insensitive.",
      inputSchema: {
        query: z.string().min(1).describe("Search query (one or more words)."),
        limit: z.number().int().min(1).max(200).optional().default(30),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const sanitized = sanitizeFtsQuery(args.query);
      if (!sanitized) {
        return jsonContent({ count: 0, entries: [], note: "Query was empty after sanitization" });
      }

      type Row = {
        id: number;
        entry_date: string;
        entry_time: string;
        pain_level: number | null;
        area: string;
        symptoms: string;
        note: string | null;
        rank: number;
      };

      const rows = rawDb
        .query<Row, [string, number, number]>(
          `SELECT
             p.id, p.entry_date, p.entry_time,
             p.pain_level, p.area, p.symptoms, p.note,
             pain_fts.rank AS rank
           FROM pain_fts
           JOIN pain_entries p ON p.id = pain_fts.rowid
           WHERE pain_fts MATCH ? AND p.user_id = ?
           ORDER BY pain_fts.rank
           LIMIT ?`
        )
        .all(sanitized, userId, args.limit ?? 30);

      return jsonContent({ count: rows.length, entries: rows });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // get_pain_stats
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_pain_stats",
    {
      title: "Aggregate pain statistics for a period",
      description:
        "Returns aggregate stats for pain entries over a period: count, average pain / fatigue level, average coffee count, total entries with pain >= 6 (high pain days), and date range covered.",
      inputSchema: {
        period: z.enum(["7d", "30d", "90d", "365d", "all"]).default("30d"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const cutoff = periodCutoff(args.period);
      const conditions = [eq(painEntries.userId, userId)];
      if (cutoff) conditions.push(gte(painEntries.entryDate, cutoff));

      const stats = db
        .select({
          count: sql<number>`COUNT(*)`,
          avgPain: sql<number | null>`AVG(${painEntries.painLevel})`,
          avgFatigue: sql<number | null>`AVG(${painEntries.fatigueLevel})`,
          avgCoffee: sql<number | null>`AVG(${painEntries.coffeeCount})`,
          highPainDays: sql<number>`SUM(CASE WHEN ${painEntries.painLevel} >= 6 THEN 1 ELSE 0 END)`,
          firstDate: sql<string | null>`MIN(${painEntries.entryDate})`,
          lastDate: sql<string | null>`MAX(${painEntries.entryDate})`,
        })
        .from(painEntries)
        .where(and(...conditions))
        .get();

      return jsonContent({
        period: args.period,
        ...(cutoff ? { since: cutoff } : {}),
        ...stats,
      });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // get_pain_areas
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_pain_areas",
    {
      title: "List configured pain body areas",
      description:
        "Returns the user's configured list of pain body areas (the master data the UI uses for tagging entries). Use this to know what valid 'area' filter values exist before calling list_pain_entries.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const rows = db
        .select({ value: painOptions.value })
        .from(painOptions)
        .where(and(eq(painOptions.userId, userId), eq(painOptions.field, "area")))
        .all();
      return jsonContent({ areas: rows.map((r) => r.value) });
    }
  );
}
