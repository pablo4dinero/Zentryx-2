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
1. If the query is purely conversational or educational with no specific product ("What is X?", "Explain Y", "How does X work?", "Tell me about Z in general"), return:
   {"kind":"conversational","agents":[]}

2. Otherwise map to one or more agents. When the query names or describes a specific product, ingredient, or scenario — even if phrased as a question — route to the relevant agent(s):
   - "formulation": recipes, formulations, ingredients, ratios, blends, premixes, "what would the formula be", "how do I make X", "build me a"
   - "sensory": taste, flavour, texture, aroma, mouthfeel, sensory profile, spider chart, radar chart, sensory scores, "how does X taste", "rate the flavour", "score the", "profile of", "evaluate the taste/flavour/texture of", umami, bitterness, saltiness, sweetness, heat profile
   - "compliance": NAFDAC, FDA, regulations, compliance, labelling, certifications, standards, permitted, allowed
   - "trendScout": trends, market, consumer, demand, popular, competitor, growing, West Africa, what's trending
   - "risk": risk, hazard, shelf life, stability, allergens, contamination, failure, safe to use
   - "optimizer": cost, savings, substitutes, reduce, optimise, cheaper, budget, save money
   - "experiment": trial, test, experiment, prototype, pilot, DOE, hypothesis, variable, how do I test
   - "insight": insights, summary, recommendations, advice, next steps, analysis, strategic, what should I do

3. For "full analysis", "analyse everything", "deep dive", "complete assessment": return ALL agents:
   {"kind":"agents","agents":["formulation","sensory","compliance","trendScout","risk","optimizer","experiment","insight"]}

Examples:
- "What is the sensory profile of a jollof seasoning?" → {"kind":"agents","agents":["sensory"]}
- "Give me a spider chart for this product" → {"kind":"agents","agents":["sensory"]}
- "How does dawadawa taste?" → {"kind":"agents","agents":["sensory"]}
- "What is MSG?" → {"kind":"conversational","agents":[]}
- "Formulate a curry seasoning" → {"kind":"agents","agents":["formulation"]}

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
