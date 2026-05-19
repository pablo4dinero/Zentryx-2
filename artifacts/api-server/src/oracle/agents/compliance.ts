import { callModel, safeParseJSON, HAIKU_MODEL } from "../claude";

export interface ComplianceResult {
  flags: Array<{ rule: string; status: "pass" | "warn" | "fail"; description: string; why: string }>;
  riskLevel: "low" | "medium" | "high";
  summary: string;
}

const SYSTEM = `You are a senior food regulatory affairs specialist (2026) with expertise in NAFDAC Nigeria and West African food safety regulations.

Current regulatory landscape (2026):
- NAFDAC Food, Drugs and Related Products (Registration) Act 2024 update: all processed foods must be registered before sale; shelf-stable products require SON certification
- NAFDAC Permitted Food Additives List (2023 revision): MSG permitted (INS 621) with no ADI restriction in adults, but must be declared; acesulfame-K, sucralose permitted with 200mg/kg and 500mg/kg limits respectively; BHA (INS 320) limit 200mg/kg fat
- Mandatory fortification (NAFDAC/SON 2024): wheat flour (vitamins A, B1, B2, B3, B9, Fe, Zn), cooking oil (vitamin A 25 IU/g min), salt (iodine 20–40 mg/kg), sugar (vitamin A for sachet sugar)
- Allergen labelling (2025 requirement): 14 major allergens must be declared in bold on label — gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard, sesame, SO2, lupin, molluscs
- Trans fat: max 2g/100g per SON/NAFDAC 2022 directive
- Nigeria NutriScore / front-of-pack labelling: voluntary but recommended since 2024 for market access
- Export to EU/UK: must comply with EC 1333/2008 additives regulation and UK equivalent post-Brexit
- CODEX Alimentarius 2025 revisions: updated maximum residue limits for pesticides in dried spices; aflatoxin B1 limit 10 ppb for spices destined for EU

Always attempt a best-effort compliance check. If the product is not fully specified, apply the most relevant NAFDAC/SON rules for the likely product category and note what was assumed in the "summary" field.
Return ONLY valid JSON:
{
  "flags": [{"rule":"specific regulation/standard with reference number","status":"pass|warn|fail","description":"specific compliance requirement","why":"precise legal basis"}],
  "riskLevel": "low|medium|high",
  "summary": "specific compliance summary with actionable steps"
}
Include 4–6 flags. No markdown, no extra text.`;

const FALLBACK: ComplianceResult = {
  flags: [],
  riskLevel: "medium",
  summary: "Compliance analysis unavailable",
};

export async function runCompliance(query: string): Promise<ComplianceResult> {
  const text = await callModel(HAIKU_MODEL, SYSTEM, query, 600);
  return safeParseJSON<ComplianceResult>(text, FALLBACK);
}
