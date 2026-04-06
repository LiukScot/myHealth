import { z } from "zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { cbtEntries } from "../../db/index.ts";
import type { McpToolContext } from "../server.ts";
import { jsonContent, sanitizeFtsQuery } from "./_shared.ts";

export function registerCbtTools(server: McpServer, ctx: McpToolContext): void {
  const { db, rawDb, userId } = ctx;

  // ────────────────────────────────────────────────────────────────────
  // list_cbt_entries
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "list_cbt_entries",
    {
      title: "List CBT thought records",
      description:
        "Returns Cognitive Behavioral Therapy thought records for the authenticated user. Each record has structured text fields: situation, thoughts, helpful reasoning, main unhelpful thought, evidence for/against, alternative explanation, worst/best scenario, friend advice, productive response. Use this to surface recent CBT work.",
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Inclusive start date (YYYY-MM-DD)."),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
          .describe("Inclusive end date (YYYY-MM-DD)."),
        limit: z.number().int().min(1).max(200).optional().default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const conditions = [eq(cbtEntries.userId, userId)];
      if (args.from) conditions.push(gte(cbtEntries.entryDate, args.from));
      if (args.to) conditions.push(lte(cbtEntries.entryDate, args.to));

      const rows = db
        .select({
          id: cbtEntries.id,
          entryDate: cbtEntries.entryDate,
          entryTime: cbtEntries.entryTime,
          situation: cbtEntries.situation,
          thoughts: cbtEntries.thoughts,
          helpfulReasoning: cbtEntries.helpfulReasoning,
          mainUnhelpfulThought: cbtEntries.mainUnhelpfulThought,
          effectOfBelieving: cbtEntries.effectOfBelieving,
          evidenceForAgainst: cbtEntries.evidenceForAgainst,
          alternativeExplanation: cbtEntries.alternativeExplanation,
          worstBestScenario: cbtEntries.worstBestScenario,
          friendAdvice: cbtEntries.friendAdvice,
          productiveResponse: cbtEntries.productiveResponse,
        })
        .from(cbtEntries)
        .where(and(...conditions))
        .orderBy(desc(cbtEntries.entryDate), desc(cbtEntries.entryTime), desc(cbtEntries.id))
        .limit(args.limit ?? 20)
        .all();

      return jsonContent({ count: rows.length, entries: rows });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // search_cbt
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "search_cbt",
    {
      title: "Full-text search CBT thought records",
      description:
        "Searches all text fields of CBT thought records (situation, thoughts, evidence, alternative explanations, etc.) using SQLite FTS5. This is the primary tool for surfacing recurring patterns of thought across past CBT work. Case- and accent-insensitive.",
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
        situation: string;
        thoughts: string;
        main_unhelpful_thought: string;
        alternative_explanation: string;
        rank: number;
      };

      const rows = rawDb
        .query<Row, [string, number, number]>(
          `SELECT
             c.id, c.entry_date, c.entry_time,
             c.situation, c.thoughts, c.main_unhelpful_thought, c.alternative_explanation,
             cbt_fts.rank AS rank
           FROM cbt_fts
           JOIN cbt_entries c ON c.id = cbt_fts.rowid
           WHERE cbt_fts MATCH ? AND c.user_id = ?
           ORDER BY cbt_fts.rank
           LIMIT ?`
        )
        .all(sanitized, userId, args.limit ?? 20);

      return jsonContent({ count: rows.length, entries: rows });
    }
  );
}
