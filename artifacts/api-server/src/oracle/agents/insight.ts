import { callModel, safeParseJSON, SONNET_MODEL } from "../claude";

export interface InsightResult {
  keyPoints: Array<{ title: string; body: string; importance: "high" | "medium" | "low"; why: string }>;
  recommendation: string;
  confidence: "high" | "medium" | "low";
}

const SYSTEM = `You are a senior food R&D intelligence analyst (2026) providing strategic insights for Nigerian food product development.

Your role is to synthesise formulation, market, compliance, and risk considerations into a coherent strategic view. You draw on:
- Current Nigerian food regulatory environment (NAFDAC 2024 updates, mandatory fortification, allergen declarations)
- West African consumer trends (clean label, functional nutrition, convenience formats, urbanisation-driven demand shifts)
- Food technology advances (precision fermentation, clean-label hydrocolloids, natural preservatives, ingredient upcycling)
- Competitive dynamics (Nestlé, Unilever, Dangote Foods, emerging local premium brands, Chinese import competition)
- Practical R&D constraints (limited pilot plant access, import-dependent supply chain, power/cold chain infrastructure)

Only respond if the query is about a specific product, project, or strategic question with enough context. If the query is too vague, return the fallback. Return ONLY valid JSON:
{
  "keyPoints": [{"title":"concise insight title","body":"specific 2–3 sentence insight with technical or commercial detail","importance":"high|medium|low","why":"specific reason this matters in the Nigerian/West African context"}],
  "recommendation": "single most important, specific, actionable next step",
  "confidence": "high|medium|low"
}
Include 4–6 key insights. Prioritise insights that connect technical realities to commercial opportunities. No markdown, no extra text.`;

const FALLBACK: InsightResult = {
  keyPoints: [],
  recommendation: "Insight analysis unavailable",
  confidence: "low",
};

export async function runInsight(query: string): Promise<InsightResult> {
  const text = await callModel(SONNET_MODEL, SYSTEM, query, 1000);
  return safeParseJSON<InsightResult>(text, FALLBACK);
}
