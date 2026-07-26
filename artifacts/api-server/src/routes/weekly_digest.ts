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

    // Parallel data queries — aggregate stats + item rows
    const [
      newAccounts,
      accountTotalResult,
      ordersResult,
      callsResult,
      bdResult,
      activitiesResult,
      projectsResult,
      tasksResult,
      // Item-level queries for card rows
      urgentPendingResult,
      deliveredOrderItemsResult,
      confidenceDropResult,
      callItemsResult,
      dispatchItemsResult,
      activityItemsResult,
      bdItemsResult,
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

      db.execute(sql.raw(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= '${weekStart.toISOString()}') AS new_this_week,
          COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) AS active_total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_total
        FROM projects
      `)),

      db.execute(sql.raw(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= '${weekStart.toISOString()}') AS new_this_week,
          COUNT(*) FILTER (WHERE status = 'done' AND updated_at >= '${weekStart.toISOString()}') AS completed_this_week,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_total
        FROM tasks
      `)),

      // Urgent pending accounts (Sales Force card rows)
      db.execute(sql.raw(`
        SELECT a.id, a.company, a.contact_person, a.product_type,
          EXTRACT(DAY FROM NOW() - a.updated_at)::int AS days_pending
        FROM accounts a
        WHERE a.approval_status = 'not_yet_approved' AND a.urgency_level = 'urgent'
        ORDER BY a.updated_at ASC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),

      // Delivered orders this week with company name
      db.execute(sql.raw(`
        SELECT apo.id, a.company, apo.volume, apo.date_delivered
        FROM account_production_orders apo
        JOIN accounts a ON apo.account_id = a.id
        WHERE apo.date_delivered IS NOT NULL
          AND apo.date_delivered != ''
          AND apo.created_at >= '${weekStart.toISOString()}'
        ORDER BY apo.date_delivered DESC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),

      // Accounts with confidence drop (< 60)
      db.execute(sql.raw(`
        SELECT af.id, a.company, af.confidence, af.status
        FROM account_forecasts af
        JOIN accounts a ON af.account_id = a.id
        WHERE af.confidence < 60
        ORDER BY af.confidence ASC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),

      // Individual call records this week with company + contact
      db.execute(sql.raw(`
        SELECT cr.id, cr.call_type, cr.outcome, cr.next_steps, cr.called_at,
          a.company, a.contact_person
        FROM call_reports cr
        JOIN accounts a ON cr.account_id = a.id
        WHERE cr.called_at >= '${weekStart.toISOString()}'
          AND cr.called_at <= '${weekEnd.toISOString()}'
        ORDER BY cr.called_at DESC
        LIMIT 15
      `)).catch(() => ({ rows: [] })),

      // Dispatch records this week
      db.execute(sql.raw(`
        SELECT dr.id, dr.sample_code, dr.follow_up_mail_sent, dr.date_sent
        FROM dispatch_records dr
        WHERE dr.created_at >= '${weekStart.toISOString()}'
        ORDER BY dr.created_at DESC
        LIMIT 15
      `)).catch(() => ({ rows: [] })),

      // Weekly activity rows with submitter name
      db.execute(sql.raw(`
        SELECT wa.id, wa.project_title, wa.product_type, wa.status,
          u.name AS user_name
        FROM weekly_activities wa
        JOIN weekly_reports wr ON wa.weekly_report_id = wr.id
        LEFT JOIN users u ON wr.user_id = u.id
        WHERE wr.start_date >= '${weekStartStr}'
        ORDER BY wa.status, wa.id DESC
        LIMIT 15
      `)).catch(() => ({ rows: [] })),

      // Business dev items active or updated this week
      db.execute(sql.raw(`
        SELECT bd.id, bd.name, bd.stage, bd.status, bd.customer_name
        FROM business_dev bd
        WHERE bd.created_at >= '${weekStart.toISOString()}'
           OR bd.updated_at >= '${weekStart.toISOString()}'
        ORDER BY bd.updated_at DESC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),
    ]);

    // ── Aggregate summaries ──────────────────────────────────────────────────
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

    const projRow = (projectsResult.rows[0] as any) ?? {};
    const newProjectsThisWeek = Number(projRow.new_this_week ?? 0);
    const activeProjects = Number(projRow.active_total ?? 0);
    const completedProjects = Number(projRow.completed_total ?? 0);

    const taskRow = (tasksResult.rows[0] as any) ?? {};
    const newTasksThisWeek = Number(taskRow.new_this_week ?? 0);
    const tasksCompletedThisWeek = Number(taskRow.completed_this_week ?? 0);
    const tasksInProgress = Number(taskRow.in_progress_total ?? 0);

    // ── Process item rows ────────────────────────────────────────────────────
    const urgentPendingRows = (urgentPendingResult.rows as any[]);
    const urgentPendingCount = urgentPendingRows.length;

    const confidenceDropRows = (confidenceDropResult.rows as any[]);
    const confidenceDropCount = confidenceDropRows.length;

    const deliveredOrderRows = (deliveredOrderItemsResult.rows as any[]);
    const callItemRows = (callItemsResult.rows as any[]);
    const dispatchRows = (dispatchItemsResult.rows as any[]);
    const activityRows = (activityItemsResult.rows as any[]);
    const bdItemRows = (bdItemsResult.rows as any[]);

    const samplesDispatched = dispatchRows.length;
    const followUpMissing = dispatchRows.filter((r: any) => !r.follow_up_mail_sent).length;

    // Sales Force item rows: urgent pending + confidence drops + delivered orders
    const salesForceItems = [
      ...urgentPendingRows.map((r: any) => ({
        company: String(r.company || "Unknown"),
        status: "pending_approval",
        detail: r.days_pending != null ? `${r.days_pending}d pending` : undefined,
      })),
      ...confidenceDropRows.map((r: any) => ({
        company: String(r.company || "Unknown"),
        status: "confidence_drop",
        detail: `Confidence: ${r.confidence}%`,
      })),
      ...deliveredOrderRows.map((r: any) => ({
        company: String(r.company || "Unknown"),
        status: "delivered",
        detail: r.volume ? `${Number(r.volume).toLocaleString()} kg` : undefined,
      })),
    ].slice(0, 12);

    // Call Reports item rows: per-call with outcome badge
    const callItems = callItemRows.map((r: any) => {
      const outcome = String(r.outcome || "").toLowerCase();
      let status: string;
      if (["success", "interested", "positive"].includes(outcome)) {
        status = "positive";
      } else if (!r.next_steps || !String(r.next_steps).trim()) {
        status = "overdue";
      } else {
        status = "on_track";
      }
      return {
        company: String(r.company || "Unknown"),
        contact: r.contact_person ? String(r.contact_person) : undefined,
        status,
      };
    });

    // Weekly Activities & Dispatch item rows
    const weeklyItems = [
      ...dispatchRows.map((r: any) => ({
        title: String(r.sample_code || "Sample"),
        type: "dispatch",
        status: r.follow_up_mail_sent ? "follow_up_sent" : "no_follow_up",
        detail: undefined as string | undefined,
      })),
      ...activityRows.map((r: any) => ({
        title: String(r.project_title || "Activity"),
        type: "activity",
        status: r.status === "completed" ? "completed" : "ongoing",
        detail: r.product_type ? String(r.product_type) : (r.user_name ? String(r.user_name) : undefined),
      })),
    ].slice(0, 12);

    // ── Oracle narrative brief (Sonnet for quality) ──────────────────────────
    const ctx = {
      weekRange: `${weekStartStr} to ${weekEndStr}`,
      accounts: { total: totalAccounts, newThisWeek: newAccountCount },
      productionOrders: { newThisWeek: totalNewOrders, delivered: deliveredOrders, totalVolumeKg: totalVolumeKg.toFixed(1) },
      callReports: { total: totalCalls, successful: successfulCalls },
      businessDev: { newItems: newBdItems },
      weeklyActivities: { completed: completedActivities, ongoing: ongoingActivities },
      projectPortfolio: { newProjects: newProjectsThisWeek, activeProjects, completedProjects, newTasks: newTasksThisWeek, tasksCompleted: tasksCompletedThisWeek, tasksInProgress },
    };

    const briefText = await callModel(
      SONNET_MODEL,
      "You are Oracle, the AI intelligence layer for Zentryx, a food science R&D company. Write a concise, professional weekly digest brief in exactly 3–4 sentences. Summarise business performance across sales, call activity, business development, project portfolio, and team activities. Reference specific numbers from the data. Use a confident, executive tone. Do not use bullet points.",
      `Week data: ${JSON.stringify(ctx)}`,
      400,
    ).catch(() => "Oracle brief unavailable — regenerate to try again.");

    // ── Section insights + agent calls in parallel (Haiku for speed/cost) ───
    const complianceCtx = JSON.stringify({
      urgentPending: urgentPendingRows.slice(0, 6).map((r: any) => ({ company: r.company, daysPending: r.days_pending })),
      confidenceDrop: confidenceDropRows.slice(0, 6).map((r: any) => ({ company: r.company, confidence: r.confidence })),
      samplesWithoutFollowUp: followUpMissing,
      totalDispatched: samplesDispatched,
    });

    const trendScoutCtx = JSON.stringify({
      newAccounts: newAccounts.slice(0, 5).map(a => ({ company: a.company, productType: a.productType })),
      bdPipeline: bdItemRows.slice(0, 5).map((r: any) => ({ name: r.name, stage: r.stage, customer: r.customer_name })),
      weeklyActivities: activityRows.slice(0, 5).map((r: any) => ({ title: r.project_title, product: r.product_type })),
      weekRange: `${weekStartStr} to ${weekEndStr}`,
    });

    const [salesInsight, callInsight, bdInsight, activitiesInsight, projectInsight, complianceInsight, trendScoutInsight] = await Promise.allSettled([
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this sales and production data for a weekly digest. Be specific.", JSON.stringify({ accounts: ctx.accounts, productionOrders: ctx.productionOrders }), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this call reports data for a weekly digest. Be specific.", JSON.stringify(ctx.callReports), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this business development data for a weekly digest. Be specific.", JSON.stringify(ctx.businessDev), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this weekly activities data for a weekly digest. Be specific.", JSON.stringify(ctx.weeklyActivities), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this project portfolio data for a weekly digest. Be specific.", JSON.stringify(ctx.projectPortfolio), 120),
      callModel(HAIKU_MODEL, "You are Oracle's Compliance Agent for Zentryx, a food science R&D company. Review the data and identify 2–3 specific compliance or risk concerns: overdue approvals, confidence drops, samples sent without follow-up. Mention company names directly where available. Keep total response under 80 words. Write in plain sentences, no bullets.", complianceCtx, 150),
      callModel(HAIKU_MODEL, "You are Oracle's Trend Scout Agent for Zentryx, a food science R&D company. Identify 2–3 specific business signals or emerging trends: new account patterns, BD pipeline momentum, product demand signals. Mention company names or products directly where available. Keep total response under 80 words. Write in plain sentences, no bullets.", trendScoutCtx, 150),
    ]);

    const getText = (r: PromiseSettledResult<string>) => r.status === "fulfilled" ? r.value : "";

    const sections = {
      salesForce: {
        newAccounts: newAccountCount,
        totalAccounts,
        newOrders: totalNewOrders,
        deliveredOrders,
        totalVolumeKg,
        urgentPendingCount,
        confidenceDropCount,
        items: salesForceItems,
        insight: getText(salesInsight),
      },
      callReports: {
        totalCalls,
        successfulCalls,
        items: callItems,
        insight: getText(callInsight),
      },
      businessDev: {
        newItems: newBdItems,
        insight: getText(bdInsight),
      },
      weeklyActivities: {
        completed: completedActivities,
        ongoing: ongoingActivities,
        samplesDispatched,
        followUpMissing,
        items: weeklyItems,
        insight: getText(activitiesInsight),
      },
      projectPortfolio: {
        newProjects: newProjectsThisWeek,
        activeProjects,
        completedProjects,
        newTasks: newTasksThisWeek,
        tasksCompleted: tasksCompletedThisWeek,
        tasksInProgress,
        insight: getText(projectInsight),
      },
      oracleAgentInsight: {
        compliance: getText(complianceInsight),
        trendScout: getText(trendScoutInsight),
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
