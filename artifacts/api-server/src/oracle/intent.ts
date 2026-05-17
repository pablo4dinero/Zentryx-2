export type AgentId =
  | "formulation" | "sensory" | "compliance" | "trendScout"
  | "risk" | "optimizer" | "experiment" | "insight";

export interface Intent {
  agents: AgentId[];
  context: string;
}

const KEYWORDS: Record<AgentId, RegExp> = {
  formulation: /formul|ingredient|recipe|ratio|blend|mix|composit|percent/i,
  sensory:     /sensory|taste|flavou?r|texture|mouthfeel|colou?r|aroma|smell/i,
  compliance:  /nafdac|fda|regulat|comply|compliance|certif|permit|law|standard|ban|recall/i,
  trendScout:  /trend|market|consumer|competitor|demand|popular|growing/i,
  risk:        /risk|hazard|stabil|shelf.?life|contamina|allergen|toxic/i,
  optimizer:   /cost|sav|budget|cheap|substitu|alternati|reduc|optim/i,
  experiment:  /trial|test|experiment|prototype|pilot|validat|hypothes|variable/i,
  insight:     /insight|recommend|advis|suggest|summar|conclus|takeaway|next.?step/i,
};

const ALL_AGENTS: AgentId[] = [
  "formulation", "sensory", "compliance", "trendScout",
  "risk", "optimizer", "experiment", "insight",
];

export function parseIntent(query: string): Intent {
  const matched = (Object.entries(KEYWORDS) as [AgentId, RegExp][])
    .filter(([, re]) => re.test(query))
    .map(([id]) => id);

  if (!matched.includes("insight")) matched.push("insight");
  if (matched.length <= 1) return { agents: ALL_AGENTS, context: query };
  return { agents: matched, context: query };
}
