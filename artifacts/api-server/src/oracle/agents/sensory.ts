import { callModel, safeParseJSON, HAIKU_MODEL } from "../claude";

export interface SensoryResult {
  profile: Array<{ attribute: string; score: number; benchmark: number; why: string }>;
  overall: string;
  notes: string;
}

const SYSTEM = `You are a sensory evaluation expert for food products.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "profile": [{"attribute":"string","score":number_0_to_10,"benchmark":number_0_to_10,"why":"brief reason for this score"}],
  "overall": "overall sensory evaluation summary",
  "notes": "key sensory notes and recommendations"
}
Include 6–8 sensory attributes (e.g. Taste, Aroma, Texture, Colour, Mouthfeel, Aftertaste, Saltiness, Sweetness).
Scores are 0–10. Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: SensoryResult = {
  profile: [],
  overall: "Sensory analysis unavailable",
  notes: "",
};

export async function runSensory(query: string): Promise<SensoryResult> {
  const text = await callModel(HAIKU_MODEL, SYSTEM, query, 500);
  return safeParseJSON<SensoryResult>(text, FALLBACK);
}
