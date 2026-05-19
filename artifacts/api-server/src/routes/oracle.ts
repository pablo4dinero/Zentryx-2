import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";
import { classifyIntent, type AgentId } from "../oracle/intent";
import { runAgent } from "../oracle/agents";
import { streamModel, SONNET_MODEL } from "../oracle/claude";

const router = Router();

function hasContent(agentId: AgentId, data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  switch (agentId) {
    case "formulation": return Array.isArray(d.ingredients) && d.ingredients.length > 0;
    case "sensory":     return Array.isArray(d.profile)     && d.profile.length > 0;
    case "compliance":  return Array.isArray(d.flags)       && d.flags.length > 0;
    case "trendScout":  return Array.isArray(d.trends)      && d.trends.length > 0;
    case "risk":        return Array.isArray(d.risks)       && d.risks.length > 0;
    case "optimizer":   return Array.isArray(d.suggestions) && d.suggestions.length > 0;
    case "experiment":  return Array.isArray(d.trials)      && d.trials.length > 0;
    case "insight":     return Array.isArray(d.keyPoints)   && d.keyPoints.length > 0;
    default:            return true;
  }
}

const ORACLE_SYSTEM = `You are Oracle, an elite food scientist and R&D strategist embedded in the Zentryx platform (2026). You operate at the intersection of food formulation science, ingredient technology, and West African market intelligence.

Your knowledge base covers:
- Modern food formulation: hydrocolloid systems, flavour encapsulation, clean-label replacers, precision fermentation-derived ingredients, Maillard control, water activity management
- Nigerian and West African food industry (2026): the market is ~$35B, driven by seasonings, snack foods, dairy analogues, fortified staples, and RTD beverages — Lagos and Abuja urban consumers now demand clean-label, low-sodium, and functional products
- Current ingredient pricing and supply: local sourcing from uziza, dawadawa, locust bean, cassava derivatives, plantain flour, moringa is commercially competitive; palm olein, soybean, and MSG prices are tracked on AFEX/Lagos commodity exchanges
- Regulatory landscape: NAFDAC 2024 revised food additive schedule, mandatory fortification guidelines (vitamin A, iron, zinc, iodine), new allergen declaration requirements effective 2025
- Processing technology: spray drying, fluidised bed coating, extrusion at 200–300 rpm for snack texture, retort sterilisation at 121°C, HPP for preservative-free products
- Sensory science: triangle tests, CATA panels, temporal dominance of sensation (TDS), Nigerian consumer preference data showing preference for umami-forward, moderate heat (Scoville 500–2000), low sweetness thresholds

Be direct, specific, and technically grounded. Cite specific values, ratios, and mechanisms — not generalities. When the user asks something that would benefit from structured analysis (formulation, risk, compliance), offer to run it.`;

const SYNTHESIS_SYSTEM = `You are Oracle, a senior food scientist and R&D strategist (2026). You have just completed a multi-agent analysis. Synthesise the findings into an expert narrative.

Rules:
- Lead with the single most critical, actionable finding
- Be technically precise: cite specific percentages, pH values, temperatures, regulations, ingredients by name
- Reference current 2026 Nigerian/West African industry realities where relevant
- Write in flowing prose — no bullet points, no headers, no lists
- If agent data was sparse, be honest about what would be needed for a full analysis
- Cap at 280 words
- Write like a Unilever/Nestlé senior R&D scientist briefing a colleague — not a textbook, not a consultant report`;

router.post("/analyze", requireAuth, async (req: AuthRequest, res) => {
  const { query, history = [] } = req.body as {
    query?: string;
    history?: { role: string; content: string }[];
  };

  if (!query?.trim()) { res.status(400).json({ error: "Query required" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "Oracle is not configured — ANTHROPIC_API_KEY missing" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // ── 1. Classify intent (Haiku, 100 tokens) ──────────────────────────────
    const intent = await classifyIntent(query.trim());
    send({ type: "intent", kind: intent.kind, agents: intent.agents });

    // ── 2a. Conversational — stream Sonnet directly ──────────────────────────
    if (intent.kind === "conversational") {
      const msgs = [
        ...history.slice(-6).map(m => ({ role: m.role as string, content: m.content })),
        { role: "user", content: query.trim() },
      ];
      for await (const token of streamModel(SONNET_MODEL, ORACLE_SYSTEM, msgs, 800)) {
        send({ type: "token", text: token });
      }

    // ── 2b. Agent mode — run agents then stream synthesis ───────────────────
    } else {
      const nonInsight = intent.agents.filter(a => a !== "insight");
      const agentResults: Partial<Record<AgentId, unknown>> = {};

      // Run specialist agents in parallel (all Haiku)
      await Promise.allSettled(
        nonInsight.map(async (agentId) => {
          try {
            send({ type: "agent_thinking", agentId });
            const data = await runAgent(agentId, query.trim());
            if (hasContent(agentId, data)) {
              agentResults[agentId] = data;
              send({ type: "agent_data", agentId, data });
            } else {
              send({ type: "agent_skip", agentId });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[Oracle/${agentId}]`, message);
            send({ type: "agent_skip", agentId });
          }
        })
      );

      // Run insight agent if requested (Sonnet, JSON structured output for expand panel)
      if (intent.agents.includes("insight")) {
        try {
          send({ type: "agent_thinking", agentId: "insight" });
          const data = await runAgent("insight", query.trim());
          if (hasContent("insight", data)) {
            agentResults["insight"] = data;
            send({ type: "agent_data", agentId: "insight", data });
          } else {
            send({ type: "agent_skip", agentId: "insight" });
          }
        } catch (err) {
          console.error("[Oracle/insight]", err);
          send({ type: "agent_skip", agentId: "insight" });
        }
      }

      // Stream Sonnet synthesis narrative as the main chat response
      const contextParts = Object.entries(agentResults)
        .map(([id, data]) => `[${id.toUpperCase()}]\n${JSON.stringify(data, null, 2)}`)
        .join("\n\n");

      const synthesisPrompt = contextParts.length > 0
        ? `User query: "${query.trim()}"\n\nAgent results:\n${contextParts}\n\nProvide a synthesised expert narrative.`
        : `User query: "${query.trim()}"\n\nProvide an expert food science response.`;

      for await (const token of streamModel(
        SONNET_MODEL, SYNTHESIS_SYSTEM,
        [{ role: "user", content: synthesisPrompt }],
        1000,
      )) {
        send({ type: "token", text: token });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Oracle]", message);
    send({ type: "error", message });
  }

  send({ type: "done" });
  res.end();
});

export default router;
