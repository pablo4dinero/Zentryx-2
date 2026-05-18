const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
export const HAIKU_MODEL  = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6";

export async function callModel(
  model: string, system: string, user: string, maxTokens: number,
): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
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

export async function* streamModel(
  model: string,
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
): AsyncGenerator<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, stream: true, system, messages,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as {
          type: string;
          delta?: { type: string; text?: string };
        };
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          yield ev.delta.text;
        }
      } catch { /* skip malformed */ }
    }
  }
}

// Backward compat — existing agents still import this
export async function callClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  return callModel(SONNET_MODEL, system, user, maxTokens);
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
