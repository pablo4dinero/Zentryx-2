import { callClaude, safeParseJSON } from "../claude";

export interface OptimizerResult {
  suggestions: Array<{ action: string; category: string; impact: "low" | "medium" | "high"; saving: string; why: string }>;
  totalSaving: string;
  priority: string;
}

const SYSTEM = `You are a food formulation cost optimisation expert for food manufacturing in Nigeria.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "suggestions": [{"action":"specific action to take","category":"cost|quality|process|ingredient","impact":"low|medium|high","saving":"estimated saving e.g. '10–15%'","why":"brief reason why this saving is achievable"}],
  "totalSaving": "estimated total cost reduction e.g. '15–25%'",
  "priority": "which suggestion to implement first and why"
}
Include 4–6 actionable suggestions. Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: OptimizerResult = {
  suggestions: [],
  totalSaving: "Unknown",
  priority: "Optimisation analysis unavailable",
};

export async function runOptimizer(query: string): Promise<OptimizerResult> {
  const text = await callClaude(SYSTEM, query, 1000);
  return safeParseJSON<OptimizerResult>(text, FALLBACK);
}
