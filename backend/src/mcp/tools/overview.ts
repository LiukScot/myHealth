import { z } from "zod";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { diaryEntries, painEntries, cbtEntries, dbtEntries } from "../../db/index.ts";
import type { McpToolContext } from "../server.ts";
import { jsonContent, periodCutoff } from "./_shared.ts";

// Allowed signals for find_correlations. Only numeric columns make sense for
// Pearson correlation, so we whitelist them statically (also prevents SQL
// injection — these strings end up interpolated into raw SQL).
const SIGNAL_DEFS = {
  mood_level: { table: "diary_entries", column: "mood_level" },
  anxiety_level: { table: "diary_entries", column: "anxiety_level" },
  depression_level: { table: "diary_entries", column: "depression_level" },
  pain_level: { table: "pain_entries", column: "pain_level" },
  fatigue_level: { table: "pain_entries", column: "fatigue_level" },
  coffee_count: { table: "pain_entries", column: "coffee_count" },
} as const;

type Signal = keyof typeof SIGNAL_DEFS;
const SIGNAL_NAMES = Object.keys(SIGNAL_DEFS) as [Signal, ...Signal[]];

export function registerOverviewTools(server: McpServer, ctx: McpToolContext): void {
  const { db, rawDb, userId } = ctx;

  // ────────────────────────────────────────────────────────────────────
  // get_overview
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_overview",
    {
      title: "Cross-cutting overview of all data over a period",
      description:
        "Returns a snapshot mixing all four entry types (diary, pain, CBT, DBT) for the period: counts, latest entry per type, top pain areas, top DBT emotions. Use this as the first call when an AI assistant wants to understand the user's recent state before drilling into specific tools.",
      inputSchema: {
        period: z.enum(["7d", "30d", "90d", "365d", "all"]).default("30d"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const cutoff = periodCutoff(args.period);

      const dateFilter = (table: typeof diaryEntries | typeof painEntries | typeof cbtEntries | typeof dbtEntries) => {
        const conds = [eq(table.userId, userId)];
        if (cutoff) conds.push(gte(table.entryDate, cutoff));
        return and(...conds);
      };

      const diaryCount = db.select({ c: sql<number>`COUNT(*)` }).from(diaryEntries).where(dateFilter(diaryEntries)).get()?.c ?? 0;
      const painCount = db.select({ c: sql<number>`COUNT(*)` }).from(painEntries).where(dateFilter(painEntries)).get()?.c ?? 0;
      const cbtCount = db.select({ c: sql<number>`COUNT(*)` }).from(cbtEntries).where(dateFilter(cbtEntries)).get()?.c ?? 0;
      const dbtCount = db.select({ c: sql<number>`COUNT(*)` }).from(dbtEntries).where(dateFilter(dbtEntries)).get()?.c ?? 0;

      const latestDiary = db.select({
        entryDate: diaryEntries.entryDate,
        entryTime: diaryEntries.entryTime,
        moodLevel: diaryEntries.moodLevel,
      }).from(diaryEntries).where(eq(diaryEntries.userId, userId))
        .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.entryTime)).limit(1).get();

      const latestPain = db.select({
        entryDate: painEntries.entryDate,
        entryTime: painEntries.entryTime,
        painLevel: painEntries.painLevel,
        area: painEntries.area,
      }).from(painEntries).where(eq(painEntries.userId, userId))
        .orderBy(desc(painEntries.entryDate), desc(painEntries.entryTime)).limit(1).get();

      // Top DBT emotions in period (count grouped by emotion_name)
      type EmotionRow = { emotion_name: string; n: number };
      const dbtParams: [number, ...string[]] = cutoff ? [userId, cutoff] : [userId];
      const dbtSql = cutoff
        ? `SELECT emotion_name, COUNT(*) AS n FROM dbt_entries
           WHERE user_id = ? AND entry_date >= ? AND emotion_name != ''
           GROUP BY emotion_name ORDER BY n DESC LIMIT 5`
        : `SELECT emotion_name, COUNT(*) AS n FROM dbt_entries
           WHERE user_id = ? AND emotion_name != ''
           GROUP BY emotion_name ORDER BY n DESC LIMIT 5`;
      const topDbtEmotions = rawDb.query<EmotionRow, typeof dbtParams>(dbtSql).all(...dbtParams);

      return jsonContent({
        period: args.period,
        ...(cutoff ? { since: cutoff } : {}),
        counts: {
          diary: diaryCount,
          pain: painCount,
          cbt: cbtCount,
          dbt: dbtCount,
        },
        latest: {
          diary: latestDiary ?? null,
          pain: latestPain ?? null,
        },
        top_dbt_emotions: topDbtEmotions,
      });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // find_correlations (Pearson over daily aggregates)
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "find_correlations",
    {
      title: "Pearson correlation between two daily-aggregated signals",
      description:
        "Computes Pearson correlation between two numeric signals aggregated by day over the given period. Useful for questions like 'does my coffee intake correlate with anxiety?'. Returns the correlation coefficient (-1 to 1), the number of overlapping days used, and the period.",
      inputSchema: {
        period: z.enum(["7d", "30d", "90d", "365d", "all"]).default("90d"),
        signal_a: z.enum(SIGNAL_NAMES).describe("First signal (numeric column)."),
        signal_b: z.enum(SIGNAL_NAMES).describe("Second signal (numeric column). Must differ from signal_a."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      if (args.signal_a === args.signal_b) {
        return jsonContent({
          error: "signal_a and signal_b must differ",
          signal_a: args.signal_a,
          signal_b: args.signal_b,
        });
      }

      const cutoff = periodCutoff(args.period);
      const defA = SIGNAL_DEFS[args.signal_a];
      const defB = SIGNAL_DEFS[args.signal_b];

      // Build daily averages for each signal (one row per date) then INNER JOIN
      // on date so only days with BOTH signals contribute. Whitelisted column
      // names above prevent SQL injection.
      const dateFilter = cutoff ? `AND entry_date >= ?` : ``;
      const params: (string | number)[] = cutoff
        ? [userId, cutoff, userId, cutoff]
        : [userId, userId];

      const sqlText = `
        WITH a AS (
          SELECT entry_date AS d, AVG(${defA.column}) AS v
          FROM ${defA.table}
          WHERE user_id = ? AND ${defA.column} IS NOT NULL ${dateFilter}
          GROUP BY entry_date
        ),
        b AS (
          SELECT entry_date AS d, AVG(${defB.column}) AS v
          FROM ${defB.table}
          WHERE user_id = ? AND ${defB.column} IS NOT NULL ${dateFilter}
          GROUP BY entry_date
        )
        SELECT a.v AS va, b.v AS vb
        FROM a INNER JOIN b ON a.d = b.d
      `;

      type Row = { va: number; vb: number };
      const rows = rawDb.query<Row, typeof params>(sqlText).all(...params);

      const n = rows.length;
      if (n < 3) {
        return jsonContent({
          period: args.period,
          ...(cutoff ? { since: cutoff } : {}),
          signal_a: args.signal_a,
          signal_b: args.signal_b,
          n,
          pearson: null,
          note: "Not enough overlapping data points (need at least 3).",
        });
      }

      const meanA = rows.reduce((s, r) => s + r.va, 0) / n;
      const meanB = rows.reduce((s, r) => s + r.vb, 0) / n;
      let num = 0, dA = 0, dB = 0;
      for (const r of rows) {
        const xa = r.va - meanA;
        const xb = r.vb - meanB;
        num += xa * xb;
        dA += xa * xa;
        dB += xb * xb;
      }
      const denom = Math.sqrt(dA * dB);
      const pearson = denom === 0 ? null : num / denom;

      return jsonContent({
        period: args.period,
        ...(cutoff ? { since: cutoff } : {}),
        signal_a: args.signal_a,
        signal_b: args.signal_b,
        n,
        pearson,
      });
    }
  );
}
