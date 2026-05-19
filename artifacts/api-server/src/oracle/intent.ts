import { callModel, safeParseJSON, HAIKU_MODEL } from "./claude";

export type AgentId =
  | "formulation" | "sensory" | "compliance" | "trendScout"
  | "risk" | "optimizer" | "experiment" | "insight";

export interface IntentResult {
  kind: "conversational" | "agents";
  agents: AgentId[];
}

const ALL_AGENTS: AgentId[] = [
  "formulation", "sensory", "compliance", "trendScout",
  "risk", "optimizer", "experiment", "insight",
];

const SYSTEM = `You are an intent classifier for Oracle, an AI food scientist tool.
Given a user query, return ONLY a JSON object — no markdown, no explanation.

Rules:
1. If the query is conversational or educational ("What is X?", "Explain Y", "Tell me about Z", "How does X work?"), return:
   {"kind":"conversational","agents":[]}

2. Otherwise map to one or more agents from this list:
   - "formulation": recipes, formulations, ingredients, ratios, blends, premixes
   - "sensory": taste, flavour, texture, aroma, mouthfeel, sensory profile, how it tastes
   - "compliance": NAFDAC, FDA, regulations, compliance, labelling, certifications, standards
   - "trendScout": trends, market, consumer, demand, popular, competitor, growing, West Africa
   - "risk": risk, hazard, shelf life, stability, allergens, contamination, failure
   - "optimizer": cost, savings, substitutes, reduce, optimise, cheaper, budget
   - "experiment": trial, test, experiment, prototype, pilot, DOE, hypothesis, variable
   - "insight": insights, summary, recommendations, advice, next steps, analysis

3. For "full analysis", "analyse everything", "deep dive", "complete assessment": return ALL agents:
   {"kind":"agents","agents":["formulation","sensory","compliance","trendScout","risk","optimizer","experiment","insight"]}

Return ONLY valid JSON.`;

const FALLBACK: IntentResult = { kind: "conversational", agents: [] };

export async function classifyIntent(query: string): Promise<IntentResult> {
  try {
    const text = await callModel(HAIKU_MODEL, SYSTEM, query, 100);
    const result = safeParseJSON<IntentResult>(text, FALLBACK);
    if (result.kind !== "conversational" && result.kind !== "agents") return FALLBACK;
    if (result.kind === "agents") {
      const valid = result.agents.filter(a => (ALL_AGENTS as string[]).includes(a));
      if (valid.length === 0) return FALLBACK;
      return { kind: "agents", agents: valid };
    }
    return result;
  } catch {
    return FALLBACK;
  }
}
