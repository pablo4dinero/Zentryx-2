import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { db } from "@workspace/db";
import { weeklyDigestsTable, accountsTable } from "@workspace/db";
import { desc, gte, sql } from "drizzle-orm";
import { callModel, HAIKU_MODEL, SONNET_MODEL } from "../oracle/claude";

const router = Router();

// GET / — latest digest for authenticated users
router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const [latest] = await db
      .select()
      .from(weeklyDigestsTable)
      .orderBy(desc(weeklyDigestsTable.generatedAt))
      .limit(1);
    res.json(latest ?? null);
  } catch (err) {
    console.error("[weekly-digest] get failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

// POST /generate — on-demand digest generation (auth required)
router.post("/generate", requireAuth, async (_req: AuthRequest, res) => {
  try {
    // Compute ISO-week boundaries (Mon–Sun)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    // Parallel data queries
    const [
      newAccounts,
      accountTotalResult,
      ordersResult,
      callsResult,
      bdResult,
      activitiesResult,
    ] = await Promise.all([
      db
        .select({ id: accountsTable.id, company: accountsTable.company, productType: (accountsTable as any).productType })
        .from(accountsTable)
        .where(gte(accountsTable.createdAt, weekStart)),

      db.execute(sql.raw(`SELECT COUNT(*) AS total FROM accounts`)),

      db.execute(sql.raw(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN date_delivered IS NOT NULL AND date_delivered != '' THEN 1 ELSE 0 END) AS delivered,
          COALESCE(SUM(volume::numeric), 0) AS total_volume
        FROM account_production_orders
        WHERE created_at >= '${weekStart.toISOString()}'
      `)),

      db.execute(sql.raw(`
        SELECT call_type, outcome, COUNT(*) AS cnt
        FROM call_reports
        WHERE called_at >= '${weekStart.toISOString()}' AND called_at <= '${weekEnd.toISOString()}'
        GROUP BY call_type, outcome
      `)),

      db.execute(sql.raw(`
        SELECT stage, status, COUNT(*) AS cnt
        FROM business_dev
        WHERE created_at >= '${weekStart.toISOString()}'
        GROUP BY stage, status
      `)),

      db.execute(sql.raw(`
        SELECT wa.status, COUNT(*) AS cnt
        FROM weekly_activities wa
        JOIN weekly_reports wr ON wa.weekly_report_id = wr.id
        WHERE wr.start_date >= '${weekStartStr}'
        GROUP BY wa.status
      `)),
    ]);

    // Summarise
    const totalAccounts = Number((accountTotalResult.rows[0] as any)?.total ?? 0);
    const newAccountCount = newAccounts.length;

    const orderRow = (ordersResult.rows[0] as any) ?? {};
    const totalNewOrders = Number(orderRow.total ?? 0);
    const deliveredOrders = Number(orderRow.delivered ?? 0);
    const totalVolumeKg = Number(orderRow.total_volume ?? 0);

    const callRows = (callsResult.rows as Array<{ call_type: string; outcome: string; cnt: string }>);
    const totalCalls = callRows.reduce((s, r) => s + Number(r.cnt), 0);
    const successfulCalls = callRows
      .filter(r => ["success", "interested", "positive"].includes((r.outcome || "").toLowerCase()))
      .reduce((s, r) => s + Number(r.cnt), 0);

    const bdRows = (bdResult.rows as Array<{ stage: string; status: string; cnt: string }>);
    const newBdItems = bdRows.reduce((s, r) => s + Number(r.cnt), 0);

    const actRows = (activitiesResult.rows as Array<{ status: string; cnt: string }>);
    const completedActivities = Number(actRows.find(r => r.status === "completed")?.cnt ?? 0);
    const ongoingActivities = Number(actRows.find(r => r.status === "ongoing")?.cnt ?? 0);

    const ctx = {
      weekRange: `${weekStartStr} to ${weekEndStr}`,
      accounts: { total: totalAccounts, newThisWeek: newAccountCount },
      productionOrders: { newThisWeek: totalNewOrders, delivered: deliveredOrders, totalVolumeKg: totalVolumeKg.toFixed(1) },
      callReports: { total: totalCalls, successful: successfulCalls },
      businessDev: { newItems: newBdItems },
      weeklyActivities: { completed: completedActivities, ongoing: ongoingActivities },
    };

    // Oracle narrative brief (Sonnet for quality)
    const briefText = await callModel(
      SONNET_MODEL,
      "You are Oracle, the AI intelligence layer for Zentryx, a food science R&D company. Write a concise, professional weekly digest brief in exactly 3–4 sentences. Summarise business performance across sales, call activity, business development, and team activities. Reference specific numbers from the data. Use a confident, executive tone. Do not use bullet points.",
      `Week data: ${JSON.stringify(ctx)}`,
      400,
    ).catch(() => "Oracle brief unavailable — regenerate to try again.");

    // Section insights in parallel (Haiku for speed/cost)
    const [salesInsight, callInsight, bdInsight, activitiesInsight] = await Promise.allSettled([
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this sales and production data for a weekly digest. Be specific.", JSON.stringify({ accounts: ctx.accounts, productionOrders: ctx.productionOrders }), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this call reports data for a weekly digest. Be specific.", JSON.stringify(ctx.callReports), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this business development data for a weekly digest. Be specific.", JSON.stringify(ctx.businessDev), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this weekly activities data for a weekly digest. Be specific.", JSON.stringify(ctx.weeklyActivities), 120),
    ]);

    const getText = (r: PromiseSettledResult<string>) => r.status === "fulfilled" ? r.value : "";

    const sections = {
      salesForce: {
        newAccounts: newAccountCount,
        totalAccounts,
        newOrders: totalNewOrders,
        deliveredOrders,
        totalVolumeKg,
        insight: getText(salesInsight),
      },
      callReports: {
        totalCalls,
        successfulCalls,
        insight: getText(callInsight),
      },
      businessDev: {
        newItems: newBdItems,
        insight: getText(bdInsight),
      },
      weeklyActivities: {
        completed: completedActivities,
        ongoing: ongoingActivities,
        insight: getText(activitiesInsight),
      },
    };

    const [digest] = await db
      .insert(weeklyDigestsTable)
      .values({ weekStartDate: weekStartStr, weekEndDate: weekEndStr, briefText, sections })
      .returning();

    res.json(digest);
  } catch (err) {
    console.error("[weekly-digest] generate failed", err);
    res.status(500).json({ error: "InternalServerError", details: String(err) });
  }
});

// POST /ask — ask Oracle a question in the context of the latest digest
router.post("/ask", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { question, digestContext } = req.body as { question: string; digestContext?: string };
    if (!question || typeof question !== "string" || question.trim().length < 2) {
      res.status(400).json({ error: "BadRequest", message: "question is required" });
      return;
    }

    const systemPrompt = [
      "You are Oracle, the AI intelligence layer for Zentryx, a food science R&D company.",
      "You are answering a question in the context of the company's Weekly Digest — a summary of this week's business performance.",
      digestContext ? `Weekly Digest context:\n${digestContext}` : "",
      "Be concise, specific, and analytical. Keep your answer under 150 words.",
    ].filter(Boolean).join("\n\n");

    const answer = await callModel(
      HAIKU_MODEL,
      systemPrompt,
      question.trim(),
      300,
    );

    res.json({ answer });
  } catch (err) {
    console.error("[weekly-digest] ask failed", err);
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
