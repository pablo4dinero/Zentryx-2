import { callModel, safeParseJSON, SONNET_MODEL } from "../claude";

export interface InsightResult {
  keyPoints: Array<{ title: string; body: string; importance: "high" | "medium" | "low"; why: string }>;
  recommendation: string;
  confidence: "high" | "medium" | "low";
}

const SYSTEM = `You are a senior food R&D intelligence analyst providing synthesised strategic insights.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "keyPoints": [{"title":"insight title","body":"2–3 sentence explanation","importance":"high|medium|low","why":"brief reason for this importance rating"}],
  "recommendation": "the single most important next action to take",
  "confidence": "high|medium|low"
}
Include 4–6 key insights that synthesise formulation, market, compliance, and risk dimensions.
Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: InsightResult = {
  keyPoints: [],
  recommendation: "Insight analysis unavailable",
  confidence: "low",
};

export async function runInsight(query: string): Promise<InsightResult> {
  const text = await callModel(SONNET_MODEL, SYSTEM, query, 1000);
  return safeParseJSON<InsightResult>(text, FALLBACK);
}
