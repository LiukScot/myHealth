import { eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { users, userPreferences, painOptions, moodOptions } from "../../db/index.ts";
import type { McpToolContext } from "../server.ts";

function groupByField(rows: { field: string; value: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const bucket = out[row.field] ?? (out[row.field] = []);
    bucket.push(row.value);
  }
  return out;
}

export function registerProfileResource(server: McpServer, ctx: McpToolContext): void {
  const { db, userId } = ctx;

  server.registerResource(
    "profile",
    "health://profile",
    {
      title: "User profile and configured tag options",
      description:
        "JSON snapshot of the authenticated user's profile: email, name, preferences, configured pain tag options (areas, symptoms, ...) and mood tag options (positive/negative/general moods). Useful background context for an AI assistant interpreting tagged entries.",
      mimeType: "application/json",
    },
    async (uri) => {
      const user = db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .get();

      const prefs = db
        .select({
          chatRange: userPreferences.chatRange,
          lastRange: userPreferences.lastRange,
          graphSelectionJson: userPreferences.graphSelectionJson,
        })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1)
        .get();

      const painOpts = db
        .select({ field: painOptions.field, value: painOptions.value })
        .from(painOptions)
        .where(eq(painOptions.userId, userId))
        .all();

      const moodOpts = db
        .select({ field: moodOptions.field, value: moodOptions.value })
        .from(moodOptions)
        .where(eq(moodOptions.userId, userId))
        .all();

      const payload = {
        user: user ?? null,
        preferences: prefs ?? null,
        pain_options: groupByField(painOpts),
        mood_options: groupByField(moodOpts),
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );
}
