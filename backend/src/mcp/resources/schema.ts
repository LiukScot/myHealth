import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolContext } from "../server.ts";

const SCHEMA_DOC = `# Health data schema

This MCP server exposes a personal health journal. The goal of this resource
is to give an AI assistant the context it needs to interpret values correctly
— in particular which way each numeric scale points.

## Tables

### diary_entries — daily mood & affect log
- **mood_level** (0-10): subjective mood. **10 = best**, 0 = worst.
- **depression_level** (0-10): subjective depression. **10 = worst**, 0 = none.
- **anxiety_level** (0-10): subjective anxiety. **10 = worst**, 0 = none.
- **positive_moods**, **negative_moods**, **general_moods**: comma-separated tags.
- **description**: free text describing the day.
- **gratitude**: free text gratitude note.
- **reflection**: free text reflection.
- One or more entries per day are possible (entry_time captures sub-day granularity).

### pain_entries — physical pain & symptoms log
- **pain_level** (0-10): pain intensity. **10 = worst**, 0 = none.
- **fatigue_level** (0-10): tiredness. **10 = worst**.
- **coffee_count** (integer): cups of coffee that day.
- **area**: comma-separated body areas (e.g. "head, neck"). Free text but
  usually drawn from the user's configured pain options.
- **symptoms**: comma-separated symptoms.
- **activities**, **medicines**, **habits**, **other**: comma-separated tags.
- **note**: free text.

### cbt_entries — CBT thought records
Cognitive Behavioral Therapy worksheets with structured text fields:
- **situation**, **thoughts**, **helpful_reasoning**
- **main_unhelpful_thought**, **effect_of_believing**
- **evidence_for_against**, **alternative_explanation**
- **worst_best_scenario**, **friend_advice**, **productive_response**

No numeric scales — these are pure reflective text.

### dbt_entries — DBT distress tolerance
Dialectical Behavior Therapy distress tolerance practice:
- **emotion_name**: the emotion being observed.
- **allow_affirmation**, **watch_emotion**: practice notes.
- **body_location**, **body_feeling**: somatic awareness.
- **present_moment**: presence anchoring.
- **emotion_returns**: notes on whether the emotion came back.

## Important interpretation notes

- **Scale direction matters**: mood is "higher is better"; depression, anxiety,
  pain, fatigue are all "higher is worse". Do not invert these when summarising.
- **Multi-value fields are CSV strings**, not arrays. Filtering with substring
  matching (LIKE %x%) is the right approach when looking for a specific tag.
- **Date/time format**: \`entry_date\` is YYYY-MM-DD, \`entry_time\` is HH:MM.
- **All data is per-user**: every tool query enforces tenant isolation; you
  cannot accidentally see another user's data through this MCP server.

## Suggested call patterns

1. **Get oriented first**: call \`get_overview\` to see counts and latest entries.
2. **Drill into a specific table**: use \`list_*_entries\` with date filters.
3. **Search for a topic**: use \`search_diary\`, \`search_cbt\`, \`search_dbt\`,
   or \`search_pain\` (FTS5, accent-insensitive).
4. **Find patterns**: use \`find_correlations\` for "does X relate to Y?" questions.
5. **Aggregate trends**: use \`get_diary_stats\` and \`get_pain_stats\` per period.
`;

export function registerSchemaResource(server: McpServer, _ctx: McpToolContext): void {
  server.registerResource(
    "schema",
    "health://schema",
    {
      title: "Health data schema and scale semantics",
      description:
        "Markdown documentation of all tables, columns, value ranges, and especially scale directions (which scales are higher-is-better vs higher-is-worse). Read this before interpreting numeric values.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: SCHEMA_DOC,
        },
      ],
    })
  );
}
