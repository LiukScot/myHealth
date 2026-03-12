export type ChatRange = "30" | "90" | "365" | "all";

const allowedModels = new Set([
  "mistral-small-latest",
  "mistral-medium-latest",
  "mistral-large-latest"
]);

export function normalizeModel(model: unknown): string {
  if (typeof model === "string" && allowedModels.has(model)) {
    return model;
  }
  return "mistral-small-latest";
}

export function normalizeRange(range: unknown): ChatRange {
  if (range === "30" || range === "90" || range === "365" || range === "all") {
    return range;
  }
  return "all";
}

export async function callMistral(
  apiKey: string,
  prompt: string,
  model: string
): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an assistant for personal health logs. Use only provided context. Be concise and actionable."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.25,
      safe_prompt: false
    })
  });

  const text = await res.text();
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail = payload?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(`Mistral error: ${detail}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Mistral returned empty response");
  }

  return Array.isArray(content) ? content.map((p) => String(p?.text ?? p ?? "")).join("\n") : String(content);
}
