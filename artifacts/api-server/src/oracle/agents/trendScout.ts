import { callModel, safeParseJSON, HAIKU_MODEL } from "../claude";

export interface TrendScoutResult {
  trends: Array<{ label: string; strength: number; direction: "up" | "down" | "stable"; why: string }>;
  summary: string;
  region: string;
}

const SYSTEM = `You are a food market intelligence analyst covering Nigeria and global food industry trends.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "trends": [{"label":"trend name","strength":number_1_to_100,"direction":"up|down|stable","why":"brief explanation of this trend's relevance"}],
  "summary": "overall market trend summary",
  "region": "geographic focus of the analysis"
}
Include 5–7 relevant market trends. Strength is 1–100. Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: TrendScoutResult = {
  trends: [],
  summary: "Trend analysis unavailable",
  region: "Nigeria / Global",
};

export async function runTrendScout(query: string): Promise<TrendScoutResult> {
  const text = await callModel(HAIKU_MODEL, SYSTEM, query, 500);
  return safeParseJSON<TrendScoutResult>(text, FALLBACK);
}
