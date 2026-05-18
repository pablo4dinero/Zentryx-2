import { callModel, safeParseJSON, HAIKU_MODEL } from "../claude";

export interface ComplianceResult {
  flags: Array<{ rule: string; status: "pass" | "warn" | "fail"; description: string; why: string }>;
  riskLevel: "low" | "medium" | "high";
  summary: string;
}

const SYSTEM = `You are a food regulatory compliance expert specialising in NAFDAC (Nigeria), FDA (US), and international food safety standards.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "flags": [{"rule":"regulation or standard name","status":"pass|warn|fail","description":"what needs attention","why":"brief reason for this status"}],
  "riskLevel": "low|medium|high",
  "summary": "overall compliance summary"
}
Include 4–6 flags covering labelling, additives, contaminants, allergens, and relevant NAFDAC requirements.
Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: ComplianceResult = {
  flags: [],
  riskLevel: "medium",
  summary: "Compliance analysis unavailable",
};

export async function runCompliance(query: string): Promise<ComplianceResult> {
  const text = await callModel(HAIKU_MODEL, SYSTEM, query, 600);
  return safeParseJSON<ComplianceResult>(text, FALLBACK);
}
