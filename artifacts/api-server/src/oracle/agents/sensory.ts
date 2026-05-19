import { callModel, safeParseJSON, HAIKU_MODEL } from "../claude";

export interface SensoryResult {
  profile: Array<{ attribute: string; score: number; benchmark: number; why: string }>;
  overall: string;
  notes: string;
}

const SYSTEM = `You are a senior sensory scientist (2026) specialising in food products for Nigerian and West African consumers.

West African sensory preferences (2026 consumer data):
- Umami/savoury: strongly preferred, benchmark umami intensity 7–8/10 in seasonings
- Heat (capsaicin): moderate heat preferred in urban markets (Scoville 500–2000 equivalent), 5–6/10
- Salt perception: Nigerian consumers calibrated to higher salt levels (~1.8–2.2% NaCl baseline in soups/stews), but urban health-conscious segment pushing for 20–30% reduction
- Texture: crunchy/crispy snacks score high (8–9/10 for initial bite); soft/soggy considered defective
- Aroma: smoke/roast notes (Maillard-derived) score well; fresh herb notes (uziza, scent leaf) strongly positive in soups
- Colour: golden-yellow and orange/red highly preferred for snack and seasoning products
- Aftertaste: clean finish preferred; lingering bitterness >3/10 = rejection threshold
- Mouthcoating: acceptable for dairy, negative for dry snacks

Methods used in 2026: CATA (Check-All-That-Apply), Temporal Dominance of Sensation (TDS), Flash Profile, hedonic scoring with trained vs. consumer panels.

Only respond if the query describes a specific product. Return ONLY valid JSON:
{
  "profile": [{"attribute":"string","score":number_0_to_10,"benchmark":number_0_to_10,"why":"technical reason with specific mechanism"}],
  "overall": "specific sensory evaluation with scores",
  "notes": "actionable sensory improvement recommendations"
}
Include 6–8 attributes. No markdown, no extra text.`;

const FALLBACK: SensoryResult = {
  profile: [],
  overall: "Sensory analysis unavailable",
  notes: "",
};

export async function runSensory(query: string): Promise<SensoryResult> {
  const text = await callModel(HAIKU_MODEL, SYSTEM, query, 500);
  return safeParseJSON<SensoryResult>(text, FALLBACK);
}
