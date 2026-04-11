import { z } from "zod";
import { eq, and, gte, lte, like, desc } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { dbtEntries } from "../../db/index.ts";
import type { McpToolContext } from "../server.ts";
import { jsonContent, sanitizeFtsQuery, escapeLike } from "./_shared.ts";

export function registerDbtTools(server: McpServer, ctx: McpToolContext): void {
  const { db, rawDb, userId } = ctx;

  // ────────────────────────────────────────────────────────────────────
  // list_dbt_entries
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "list_dbt_entries",
    {
      title: "List DBT distress tolerance entries",
      description:
        "Returns Dialectical Behavior Therapy distress tolerance entries. Each entry has structured fields capturing the emotion observed (name, body location, body feeling), affirmations, presence practice, and notes on whether the emotion returned. Use this to track DBT work over time.",
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Inclusive start date (YYYY-MM-DD)."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Inclusive end date (YYYY-MM-DD)."),
        emotion_contains: z.string().optional()
          .describe("Filter by emotion name substring."),
        limit: z.number().int().min(1).max(200).optional().default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const conditions = [eq(dbtEntries.userId, userId)];
      if (args.from) conditions.push(gte(dbtEntries.entryDate, args.from));
      if (args.to) conditions.push(lte(dbtEntries.entryDate, args.to));
      if (args.emotion_contains) {
        conditions.push(like(dbtEntries.emotionName, `%${escapeLike(args.emotion_contains)}%`));
      }

      const rows = db
        .select({
          id: dbtEntries.id,
          entryDate: dbtEntries.entryDate,
          entryTime: dbtEntries.entryTime,
          emotionName: dbtEntries.emotionName,
          allowAffirmation: dbtEntries.allowAffirmation,
          watchEmotion: dbtEntries.watchEmotion,
          bodyLocation: dbtEntries.bodyLocation,
          bodyFeeling: dbtEntries.bodyFeeling,
          presentMoment: dbtEntries.presentMoment,
          emotionReturns: dbtEntries.emotionReturns,
        })
        .from(dbtEntries)
        .where(and(...conditions))
        .orderBy(desc(dbtEntries.entryDate), desc(dbtEntries.entryTime), desc(dbtEntries.id))
        .limit(args.limit ?? 20)
        .all();

      return jsonContent({ count: rows.length, entries: rows });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // search_dbt
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "search_dbt",
    {
      title: "Full-text search DBT entries",
      description:
        "Searches all text fields of DBT entries (emotion name, affirmations, body sensations, present-moment notes, etc.) using SQLite FTS5. Case- and accent-insensitive.",
      inputSchema: {
        query: z.string().min(1).describe("Search query (one or more words)."),
        limit: z.number().int().min(1).max(100).optional().default(20),
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
        emotion_name: string;
        body_location: string;
        body_feeling: string;
        present_moment: string;
        rank: number;
      };

      const rows = rawDb
        .query<Row, [string, number, number]>(
          `SELECT
             d.id, d.entry_date, d.entry_time,
             d.emotion_name, d.body_location, d.body_feeling, d.present_moment,
             dbt_fts.rank AS rank
           FROM dbt_fts
           JOIN dbt_entries d ON d.id = dbt_fts.rowid
           WHERE dbt_fts MATCH ? AND d.user_id = ?
           ORDER BY dbt_fts.rank
           LIMIT ?`
        )
        .all(sanitized, userId, args.limit ?? 20);

      return jsonContent({ count: rows.length, entries: rows });
    }
  );
}
