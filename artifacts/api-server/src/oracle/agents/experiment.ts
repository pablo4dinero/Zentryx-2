import { callClaude, safeParseJSON } from "../claude";

export interface ExperimentResult {
  trials: Array<{ name: string; variables: string[]; hypothesis: string; duration: string; why: string }>;
  priority: string;
  methodology: string;
}

const SYSTEM = `You are a food R&D experimental design expert.
Analyse the user's query and return ONLY a JSON object with this exact structure:
{
  "trials": [{"name":"trial name","variables":["variable1","variable2"],"hypothesis":"what you expect to find","duration":"e.g. '2 weeks'","why":"brief reason for prioritising this trial"}],
  "priority": "which trial to run first and why",
  "methodology": "recommended overall experimental methodology (e.g. DoE, one-factor-at-a-time)"
}
Include 3–5 trial recommendations. Return ONLY the JSON — no markdown, no extra text.`;

const FALLBACK: ExperimentResult = {
  trials: [],
  priority: "Experimental design unavailable",
  methodology: "",
};

export async function runExperiment(query: string): Promise<ExperimentResult> {
  const text = await callClaude(SYSTEM, query, 1000);
  return safeParseJSON<ExperimentResult>(text, FALLBACK);
}
