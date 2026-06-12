import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, AuthRequest } from "../lib/auth";
import { classifyIntent, type AgentId } from "../oracle/intent";
import { runAgent } from "../oracle/agents";
import { streamModel, SONNET_MODEL } from "../oracle/claude";

const router = Router();

// ── Oracle rate limit: 20 requests per user per 10 minutes ────────────────────
// Keyed on user ID (from JWT) so limits are per-user, not per-IP.
// This prevents one heavy user from exhausting the Anthropic quota for everyone.
const oracleLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as AuthRequest).user?.userId?.toString() ?? req.ip ?? "unknown",
  message: { error: "TooManyRequests", message: "Oracle limit reached — 20 requests per 10 minutes. Try again shortly." },
});

// ── Concurrency queue: max 5 simultaneous Anthropic calls ─────────────────────
// Prevents pile-ups that cause Anthropic to throttle (529 overloaded errors).
// Requests beyond the limit wait in queue rather than failing immediately.
let activeOracleCalls = 0;
const MAX_CONCURRENT = 5;
const oracleQueue: Array<() => void> = [];

function acquireOracleSlot(): Promise<void> {
  return new Promise(resolve => {
    if (activeOracleCalls < MAX_CONCURRENT) {
      activeOracleCalls++;
      resolve();
    } else {
      oracleQueue.push(() => { activeOracleCalls++; resolve(); });
    }
  });
}

function releaseOracleSlot() {
  activeOracleCalls--;
  const next = oracleQueue.shift();
  if (next) next();
}

function withOracleQueue(_req: Request, res: Response, next: NextFunction) {
  acquireOracleSlot().then(next).catch(() => {
    res.status(503).json({ error: "Oracle queue full — try again in a moment." });
  });
  // Release slot exactly once — whichever event fires first
  let released = false;
  const release = () => { if (!released) { released = true; releaseOracleSlot(); } };
  res.on("finish", release);
  res.on("close",  release);
}

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

const ORACLE_SYSTEM = `You are Oracle, an elite food scientist and R&D strategist embedded in the Zentryx platform (2026). You operate at the intersection of food formulation science, ingredient technology, and global food industry intelligence with a strong focus on West African markets.

Your knowledge base covers:
- Modern food formulation: hydrocolloid systems, flavour encapsulation, clean-label replacers, precision fermentation-derived ingredients, Maillard control, water activity management
- Nigerian and West African food industry (2026): the market is ~$35B, driven by seasonings, snack foods, dairy analogues, fortified staples, and RTD beverages — Lagos and Abuja urban consumers now demand clean-label, low-sodium, and functional products
- Current ingredient pricing and supply: local sourcing from uziza, dawadawa, locust bean, cassava derivatives, plantain flour, moringa is commercially competitive; palm olein, soybean, and MSG prices tracked on AFEX/Lagos commodity exchanges
- Regulatory landscape: NAFDAC 2024 revised food additive schedule, Codex Alimentarius, EU/UK food law, FDA standards, mandatory fortification guidelines, allergen declaration requirements
- Processing technology: spray drying, fluidised bed coating, extrusion, retort sterilisation, HPP for preservative-free products, aseptic processing
- Sensory science: triangle tests, CATA panels, TDS, consumer preference mapping, flavour pairing principles
- Food chemistry: emulsification, gelation, starch gelatinisation, protein denaturation, lipid oxidation, colour stability, pH and Aw control

Output format rules:
- When the user asks for a table or comparison, ALWAYS output a proper markdown table.
- When the user asks for a formula or ingredient list, present it as a table with columns: Ingredient | % | Role.
- Use markdown headers and lists when structure improves clarity.
- Be direct, specific, and technically grounded — cite actual values, ratios, mechanisms.
- The conversation history may contain product details, formulations, or context from earlier messages — use it.
- NEVER generate ASCII, text-based, or pseudo-graphical charts, spider diagrams, radar profiles, or any visual representation made of characters (|, -, +, dashes). The platform renders real interactive charts automatically when agents run. If the user asks for a sensory profile, spider/radar chart, or visualised scores for a specific product, direct them to use the Sensory agent for a proper interactive radar chart.`;

const SYNTHESIS_SYSTEM = `You are Oracle, a senior food scientist and R&D strategist (2026). You have just completed a multi-agent analysis. Synthesise the findings into a clear expert response.

Rules:
- Lead with the single most critical, actionable finding
- Be technically precise: cite specific percentages, pH values, temperatures, regulations, ingredients by name
- Reference current 2026 Nigerian/West African industry realities where relevant
- Use the output format that best serves the content: prose for narrative, markdown tables for comparisons/formulas/structured data, bullet points for action lists
- If the user asked for a table, a formula, or structured output — honour that request in your synthesis
- If agent data was sparse, be honest about what would be needed for a full analysis
- Cap at 350 words
- Write like a Unilever/Nestlé senior R&D scientist briefing a colleague — not a textbook, not a consultant report
- The conversation history may contain earlier product details or formulations — reference them if relevant
- NEVER generate ASCII, text-based, or pseudo-graphical charts, spider diagrams, radar profiles, or bar graphs made of characters. Sensory profile data from the Sensory agent is already rendered as an interactive radar chart above — reference its scores by name and number in your prose instead of redrawing them.
- When Sensory agent data is present, DO NOT output a markdown table of the sensory attributes/scores — the radar chart already shows it. Discuss the scores in prose only. (Markdown tables remain fine for non-sensory comparisons such as cost or formula breakdowns.)`;

router.post("/analyze", requireAuth, oracleLimiter, withOracleQueue, async (req: AuthRequest, res) => {
  const { query, history = [], forceAgents } = req.body as {
    query?: string;
    history?: { role: string; content: string }[];
    forceAgents?: string[];
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
    // ── 1. Classify intent (or use forced agents) ───────────────────────────
    const ALL_AGENT_IDS = ["formulation","sensory","compliance","trendScout","risk","optimizer","experiment","insight"];
    let intent: { kind: "conversational" | "agents"; agents: AgentId[] };
    if (forceAgents && forceAgents.length > 0) {
      const valid = forceAgents.filter(a => ALL_AGENT_IDS.includes(a)) as AgentId[];
      intent = valid.length > 0
        ? { kind: "agents", agents: valid }
        : { kind: "conversational", agents: [] };
    } else {
      const historyHint = history.slice(-4)
        .map(m => `${m.role === "assistant" ? "Oracle" : "User"}: ${m.content.slice(0, 120)}`)
        .join("\n");
      intent = await classifyIntent(query.trim(), historyHint || undefined);
    }
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

      // Recent conversation context. Agents would otherwise receive only the
      // bare current query, which breaks follow-ups like "show me a chart" —
      // the agent has no product to profile, returns nothing, and no chart
      // renders. Prepending the context lets the agent identify the product
      // (formula/sensory target) established earlier in the conversation.
      const historyContext = history.slice(-4)
        .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join("\n");
      const agentQuery = historyContext
        ? `Conversation so far (identify the product/formulation under discussion and analyse THAT product):\n${historyContext}\n\nCurrent request: ${query.trim()}`
        : query.trim();

      // Run specialist agents in parallel (all Haiku)
      await Promise.allSettled(
        nonInsight.map(async (agentId) => {
          try {
            send({ type: "agent_thinking", agentId });
            const data = await runAgent(agentId, agentQuery);
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
          const data = await runAgent("insight", agentQuery);
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

      const synthesisPrompt = [
        historyContext ? `Conversation context:\n${historyContext}\n` : "",
        contextParts ? `Agent results:\n${contextParts}\n` : "",
        `User query: "${query.trim()}"`,
        contextParts ? "\nProvide a synthesised expert response." : "\nProvide an expert food science response.",
      ].join("\n").trim();

      for await (const token of streamModel(
        SONNET_MODEL, SYNTHESIS_SYSTEM,
        [{ role: "user", content: synthesisPrompt }],
        1200,
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
