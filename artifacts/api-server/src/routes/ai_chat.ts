import { Router } from "express";
import { requireAuth, AuthRequest } from "../lib/auth";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "dummy",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are Zentryx AI, an expert food science and R&D intelligence assistant for the Zentryx platform. You help R&D teams with:
- Food formulation insights and recommendations (Seasoning, Snack Dusting, Bread & Dough Premix, Dairy Premix, Functional Blend, Pasta Sauce, Sweet Flavour, Savoury Flavour)
- Project lifecycle advice (Testing, Reformulation, Innovation, Cost Optimization, Modification stages)
- Market trends in food science
- Cost optimization strategies
- Ingredient recommendations and substitutions
- Regulatory compliance questions
- Quality and sensory evaluation guidance
Be concise, professional, and actionable. Use bullet points for clarity. Always relate your answers to food science and R&D context.`;

router.post("/message", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { message, history } = req.body;
    if (!message) { res.status(400).json({ error: "Message required" }); return; }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(history || []).slice(-20).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages,
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
    res.end();
  } catch (err) {
    console.error("AI chat error:", err);
    res.write(`data: ${JSON.stringify({ error: "AI service unavailable" })}\n\n`);
    res.end();
  }
});

export default router;
