import type { AgentId } from "../intent";
import { runFormulation } from "./formulation";
import { runSensory } from "./sensory";
import { runCompliance } from "./compliance";
import { runTrendScout } from "./trendScout";
import { runRisk } from "./risk";
import { runOptimizer } from "./optimizer";
import { runExperiment } from "./experiment";
import { runInsight } from "./insight";

export type { AgentId };

const RUNNERS: Record<AgentId, (q: string) => Promise<unknown>> = {
  formulation: runFormulation,
  sensory:     runSensory,
  compliance:  runCompliance,
  trendScout:  runTrendScout,
  risk:        runRisk,
  optimizer:   runOptimizer,
  experiment:  runExperiment,
  insight:     runInsight,
};

export async function runAgent(id: AgentId, query: string): Promise<unknown> {
  return RUNNERS[id](query);
}
