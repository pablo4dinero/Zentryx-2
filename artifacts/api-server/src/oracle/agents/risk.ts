import { callModel, safeParseJSON, HAIKU_MODEL } from "../claude";

export interface RiskResult {
  risks: Array<{ factor: string; severity: "low" | "medium" | "high"; probability: number; mitigation: string; why: string }>;
  overall: string;
}

const SYSTEM = `You are a food safety and formulation risk analyst.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "risks": [{"factor":"risk factor name","severity":"low|medium|high","probability":number_0_to_100,"mitigation":"recommended action","why":"brief reason for this severity rating"}],
  "overall": "overall risk assessment summary"
}
Include 4–6 risk factors covering stability, allergens, contamination, shelf life, and formulation hazards. Probability is 0–100.
Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: RiskResult = {
  risks: [],
  overall: "Risk analysis unavailable",
};

export async function runRisk(query: string): Promise<RiskResult> {
  const text = await callModel(HAIKU_MODEL, SYSTEM, query, 500);
  return safeParseJSON<RiskResult>(text, FALLBACK);
}
