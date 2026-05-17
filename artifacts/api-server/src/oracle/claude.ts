const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

export async function callClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content.find(c => c.type === "text")?.text ?? "";
}

export function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(stripped);
  } catch {
    try {
      const m = text.match(/(\{[\s\S]*\})/);
      if (m) return JSON.parse(m[1]);
    } catch {}
    return fallback;
  }
}
