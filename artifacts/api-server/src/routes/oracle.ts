import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";
import { classifyIntent, type AgentId } from "../oracle/intent";
import { runAgent } from "../oracle/agents";
import { streamModel, SONNET_MODEL } from "../oracle/claude";

const router = Router();

const ORACLE_SYSTEM = `You are Oracle, a senior food scientist and R&D strategist inside the Zentryx platform. You have deep expertise in food formulation, ingredient functionality, sensory science, regulatory compliance, and product development in the Nigerian and West African context. Answer questions conversationally, precisely, and with genuine expertise. Be direct and opinionated. Never hedge unnecessarily. When relevant, mention that you can run a full formulation, sensory analysis, risk assessment, or other specialist analysis if the user wants structured data.`;

const SYNTHESIS_SYSTEM = `You are Oracle, a senior food scientist and R&D strategist inside the Zentryx platform. You have just completed a multi-agent analysis of the user's query. Synthesise the findings into a clear, expert narrative response. Write like a senior food scientist explaining insights to a colleague — direct, precise, and actionable. Lead with the single most important finding. Use flowing prose, not bullet points or headers. Be technically precise but conversational. Cap your response at 300 words.`;

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
            agentResults[agentId] = data;
            send({ type: "agent_data", agentId, data });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[Oracle/${agentId}]`, message);
            send({ type: "agent_error", agentId, message });
          }
        })
      );

      // Run insight agent if requested (Sonnet, JSON structured output for expand panel)
      if (intent.agents.includes("insight")) {
        try {
          send({ type: "agent_thinking", agentId: "insight" });
          const data = await runAgent("insight", query.trim());
          agentResults["insight"] = data;
          send({ type: "agent_data", agentId: "insight", data });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[Oracle/insight]", message);
          send({ type: "agent_error", agentId: "insight", message });
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
