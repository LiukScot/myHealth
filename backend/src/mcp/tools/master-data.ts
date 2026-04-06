import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { painOptions, moodOptions } from "../../db/index.ts";
import type { McpToolContext } from "../server.ts";
import { jsonContent } from "./_shared.ts";

/** Groups option rows by their `field` column into a record. */
function groupByField(rows: { field: string; value: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const bucket = out[row.field] ?? (out[row.field] = []);
    bucket.push(row.value);
  }
  return out;
}

export function registerMasterDataTools(server: McpServer, ctx: McpToolContext): void {
  const { db, userId } = ctx;

  // ────────────────────────────────────────────────────────────────────
  // get_pain_options
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_pain_options",
    {
      title: "Get configured pain tag options",
      description:
        "Returns the user's configured pain tag values, grouped by field: area, symptoms, activities, medicines, habits, other. These are the master data the UI uses for tagging pain entries — useful to know what valid filter values exist.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const rows = db
        .select({ field: painOptions.field, value: painOptions.value })
        .from(painOptions)
        .where(eq(painOptions.userId, userId))
        .all();
      return jsonContent({ pain_options: groupByField(rows) });
    }
  );

  // ────────────────────────────────────────────────────────────────────
  // get_mood_options
  // ────────────────────────────────────────────────────────────────────
  server.registerTool(
    "get_mood_options",
    {
      title: "Get configured mood tag options",
      description:
        "Returns the user's configured mood tag values, grouped by field: positive_moods, negative_moods, general_moods. These are the master data the UI uses for tagging diary entries.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const rows = db
        .select({ field: moodOptions.field, value: moodOptions.value })
        .from(moodOptions)
        .where(eq(moodOptions.userId, userId))
        .all();
      return jsonContent({ mood_options: groupByField(rows) });
    }
  );
}
