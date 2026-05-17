import { callClaude, safeParseJSON } from "../claude";

export interface FormulationResult {
  ingredients: Array<{ name: string; pct: number; role: string; why: string }>;
  totalWeight: number;
  notes: string;
  why: string;
}

const SYSTEM = `You are a food formulation expert for a Nigerian food R&D company specialising in seasoning blends, snack dusting, premixes, and functional ingredients.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "ingredients": [{"name":"string","pct":number,"role":"string","why":"brief reason for this specific percentage"}],
  "totalWeight": 100,
  "notes": "key formulation notes",
  "why": "brief explanation of the overall formulation strategy"
}
Percentages must sum to 100. Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: FormulationResult = {
  ingredients: [],
  totalWeight: 100,
  notes: "Formulation analysis unavailable",
  why: "",
};

export async function runFormulation(query: string): Promise<FormulationResult> {
  const text = await callClaude(SYSTEM, query, 1200);
  return safeParseJSON<FormulationResult>(text, FALLBACK);
}
