import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";
import { parseIntent, type AgentId } from "../oracle/intent";
import { runAgent } from "../oracle/agents";

const router = Router();

router.post("/analyze", requireAuth, async (req: AuthRequest, res) => {
  const { query } = req.body as { query?: string };
  if (!query?.trim()) { res.status(400).json({ error: "Query required" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "Oracle is not configured (ANTHROPIC_API_KEY missing)" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const { agents, context } = parseIntent(query.trim());
  send({ status: "started", agents });

  const agentPromises = agents.map(async (agentId: AgentId) => {
    try {
      send({ agent: agentId, status: "thinking" });
      const data = await runAgent(agentId, context);
      send({ agent: agentId, status: "done", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Oracle/${agentId}] Error:`, message);
      send({ agent: agentId, status: "error", message });
    }
  });

  await Promise.allSettled(agentPromises);
  send({ status: "complete" });
  res.end();
});

export default router;
