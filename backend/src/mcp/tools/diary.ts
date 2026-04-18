import { z } from "zod";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { diaryEntries } from "../../db/index.ts";
import type { McpToolContext } from "../server.ts";
import { jsonContent, periodCutoff, sanitizeFtsQuery } from "./_shared.ts";

export function registerDiaryTools(server: McpServer, ctx: McpToolContext): void {
  const { db, rawDb, userId } = ctx;

  // ────────────────────────────────────────────────────────────────────
  // list_diary_entries
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "list_diary_entries",
    {
      title: "List diary entries",
      description:
        "Returns diary entries for the authenticated user, optionally filtered by date range, mood level, anxiety, or depression. Each entry includes mood/anxiety/depression scores and free-text fields (description, gratitude).",
      inputSchema: {
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Inclusive start date (YYYY-MM-DD)."),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Inclusive end date (YYYY-MM-DD)."),
        mood_min: z.number().int().min(0).max(10).optional()
          .describe("Minimum mood level (0-10, where 10 is best)."),
        mood_max: z.number().int().min(0).max(10).optional()
          .describe("Maximum mood level (0-10)."),
        anxiety_min: z.number().int().min(0).max(10).optional()
          .describe("Minimum anxiety level (0-10, where 10 is worst)."),
        depression_min: z.number().int().min(0).max(10).optional()
          .describe("Minimum depression level (0-10, where 10 is worst)."),
        limit: z.number().int().min(1).max(500).optional().default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const conditions = [eq(diaryEntries.userId, userId)];
      if (args.from) conditions.push(gte(diaryEntries.entryDate, args.from));
      if (args.to) conditions.push(lte(diaryEntries.entryDate, args.to));
      if (args.mood_min !== undefined) conditions.push(gte(diaryEntries.moodLevel, args.mood_min));
      if (args.mood_max !== undefined) conditions.push(lte(diaryEntries.moodLevel, args.mood_max));
      if (args.anxiety_min !== undefined) conditions.push(gte(diaryEntries.anxietyLevel, args.anxiety_min));
      if (args.depression_min !== undefined) conditions.push(gte(diaryEntries.depressionLevel, args.depression_min));

      const rows = db
        .select({
          id: diaryEntries.id,
          entryDate: diaryEntries.entryDate,
          entryTime: diaryEntries.entryTime,
          moodLevel: diaryEntries.moodLevel,
          depressionLevel: diaryEntries.depressionLevel,
          anxietyLevel: diaryEntries.anxietyLevel,
          positiveMoods: diaryEntries.positiveMoods,
          negativeMoods: diaryEntries.negativeMoods,
          generalMoods: diaryEntries.generalMoods,
          description: diaryEntries.description,
          gratitude: diaryEntries.gratitude,
        })
        .from(diaryEntries)
        .where(and(...conditions))
        .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.entryTime), desc(diaryEntries.id))
        .limit(args.limit ?? 50)
        .all();

      return jsonContent({ count: rows.length, entries: rows });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // search_diary (FTS5)
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "search_diary",
    {
      title: "Full-text search diary entries",
      description:
        "Searches diary entry text (description plus legacy reflection text still indexed in FTS) using SQLite FTS5. Matching is case-insensitive and accent-insensitive. Result rows omit reflection content. Results are ranked by FTS5 bm25 relevance.",
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
        mood_level: number | null;
        anxiety_level: number | null;
        depression_level: number | null;
        description: string | null;
        rank: number;
      };

      const rows = rawDb
        .query<Row, [string, number, number]>(
          `SELECT
             d.id, d.entry_date, d.entry_time,
             d.mood_level, d.anxiety_level, d.depression_level,
             d.description,
             diary_fts.rank AS rank
           FROM diary_fts
           JOIN diary_entries d ON d.id = diary_fts.rowid
           WHERE diary_fts MATCH ? AND d.user_id = ?
           ORDER BY diary_fts.rank
           LIMIT ?`
        )
        .all(sanitized, userId, args.limit ?? 30);

      return jsonContent({ count: rows.length, entries: rows });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // get_diary_stats
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_diary_stats",
    {
      title: "Aggregate diary statistics for a period",
      description:
        "Returns aggregate statistics for diary entries over the given period: count, average mood / anxiety / depression, and the date range covered. Use this before drilling into individual entries to get an overview.",
      inputSchema: {
        period: z.enum(["7d", "30d", "90d", "365d", "all"]).default("30d"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const cutoff = periodCutoff(args.period);

      const conditions = [eq(diaryEntries.userId, userId)];
      if (cutoff) conditions.push(gte(diaryEntries.entryDate, cutoff));

      const stats = db
        .select({
          count: sql<number>`COUNT(*)`,
          avgMood: sql<number | null>`AVG(${diaryEntries.moodLevel})`,
          avgAnxiety: sql<number | null>`AVG(${diaryEntries.anxietyLevel})`,
          avgDepression: sql<number | null>`AVG(${diaryEntries.depressionLevel})`,
          firstDate: sql<string | null>`MIN(${diaryEntries.entryDate})`,
          lastDate: sql<string | null>`MAX(${diaryEntries.entryDate})`,
        })
        .from(diaryEntries)
        .where(and(...conditions))
        .get();

      return jsonContent({
        period: args.period,
        ...(cutoff ? { since: cutoff } : {}),
        ...stats,
      });
    }
  );
}
