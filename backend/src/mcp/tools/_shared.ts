// Shared helpers for MCP tool handlers.

/**
 * Wraps a JSON-serializable payload in the MCP content-block format that
 * tool handlers must return. Pretty-printing makes raw responses readable
 * when inspected by humans, and AI clients have no trouble parsing them.
 */
export function jsonContent(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

/**
 * Plain text content block — for resources and human-oriented responses
 * (e.g. the schema doc resource).
 */
export function textContent(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

export type Period = "7d" | "30d" | "90d" | "365d" | "all";

/** Returns YYYY-MM-DD cutoff for the given period, or null for "all". */
export function periodCutoff(period: Period): string | null {
  if (period === "all") return null;
  const days = Number(period.replace("d", ""));
  const cutoff = new Date(Date.now() - days * 86_400_000);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Sanitises a free-text query for safe injection into FTS5 MATCH expressions.
 * FTS5 treats `"`, `(`, `)`, `*`, `:`, `^` as syntax — an unbalanced character
 * from an LLM-generated query would otherwise cause `fts5: syntax error`.
 */
export function sanitizeFtsQuery(raw: string): string {
  return raw.replace(/["()*:^]/g, " ").trim();
}

/**
 * Escapes SQL LIKE special characters (% and _) so they are treated as
 * literal characters in a LIKE pattern, not wildcards.
 */
export function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
