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

    // All queries in parallel — aggregate stats + full item rows
    const [
      newAccounts,
      accountTotalResult,
      ordersResult,
      callsResult,
      bdResult,
      activitiesResult,
      projectsResult,
      tasksResult,
      // Sales Force item rows
      urgentPendingResult,
      deliveredOrderItemsResult,
      confidenceDropResult,
      // Call Reports: detailed per-call rows + overdue follow-ups
      callItemsResult,
      overdueCallsResult,
      // Weekly Activities & Dispatch
      dispatchItemsResult,
      activityItemsResult,
      // Business dev
      bdItemsResult,
      // Project Portfolio: specific projects + recent task completions
      projectItemsResult,
      recentTasksResult,
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

      // Urgent pending accounts
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

      // Confidence drop accounts
      db.execute(sql.raw(`
        SELECT af.id, a.company, af.confidence, af.status
        FROM account_forecasts af
        JOIN accounts a ON af.account_id = a.id
        WHERE af.confidence < 60
        ORDER BY af.confidence ASC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),

      // Full call detail rows for this week — includes summary, next_steps, comment count
      db.execute(sql.raw(`
        SELECT
          cr.id, cr.call_type, cr.outcome, cr.summary, cr.next_steps,
          cr.called_at, cr.created_by_name,
          a.company, a.contact_person,
          EXTRACT(DAY FROM NOW() - cr.called_at)::int AS days_ago,
          GREATEST(0, 7 - EXTRACT(DAY FROM NOW() - cr.called_at)::int) AS days_left,
          COALESCE(cc.comment_count, 0) AS comment_count
        FROM call_reports cr
        JOIN accounts a ON cr.account_id = a.id
        LEFT JOIN (
          SELECT report_id, COUNT(*) AS comment_count
          FROM call_report_comments
          GROUP BY report_id
        ) cc ON cc.report_id = cr.id
        WHERE cr.called_at >= '${weekStart.toISOString()}'
          AND cr.called_at <= '${weekEnd.toISOString()}'
        ORDER BY cr.called_at DESC
        LIMIT 15
      `)).catch(() => ({ rows: [] })),

      // Overdue follow-ups: accounts with next_steps on old call, no call in 14+ days
      db.execute(sql.raw(`
        SELECT DISTINCT ON (cr.account_id)
          a.company, a.contact_person,
          cr.outcome, cr.next_steps,
          EXTRACT(DAY FROM NOW() - cr.called_at)::int AS days_since
        FROM call_reports cr
        JOIN accounts a ON cr.account_id = a.id
        WHERE cr.next_steps IS NOT NULL
          AND cr.next_steps != ''
          AND cr.called_at < NOW() - INTERVAL '14 days'
          AND NOT EXISTS (
            SELECT 1 FROM call_reports cr2
            WHERE cr2.account_id = cr.account_id
              AND cr2.called_at > cr.called_at
              AND cr2.called_at >= NOW() - INTERVAL '14 days'
          )
        ORDER BY cr.account_id, cr.called_at DESC
        LIMIT 5
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

      // Business dev items active this week
      db.execute(sql.raw(`
        SELECT bd.id, bd.name, bd.stage, bd.status, bd.customer_name
        FROM business_dev bd
        WHERE bd.created_at >= '${weekStart.toISOString()}'
           OR bd.updated_at >= '${weekStart.toISOString()}'
        ORDER BY bd.updated_at DESC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),

      // Specific projects created or updated this week with task counts
      db.execute(sql.raw(`
        SELECT
          p.id, p.name, p.status, p.product_type,
          COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.updated_at >= '${weekStart.toISOString()}') AS tasks_done_week,
          COUNT(t.id) FILTER (WHERE t.status = 'in_progress') AS tasks_in_progress,
          COUNT(t.id) FILTER (WHERE t.updated_at >= '${weekStart.toISOString()}') AS tasks_updated_week
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.updated_at >= '${weekStart.toISOString()}'
           OR p.created_at >= '${weekStart.toISOString()}'
        GROUP BY p.id, p.name, p.status, p.product_type
        ORDER BY (COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.updated_at >= '${weekStart.toISOString()}')) DESC, p.updated_at DESC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),

      // Tasks completed this week — to show per-project detail
      db.execute(sql.raw(`
        SELECT t.project_id, t.title
        FROM tasks t
        WHERE t.status = 'done'
          AND t.updated_at >= '${weekStart.toISOString()}'
        ORDER BY t.updated_at DESC
        LIMIT 50
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
    const dispatchRows = (dispatchItemsResult.rows as any[]);
    const activityRows = (activityItemsResult.rows as any[]);
    const bdItemRows = (bdItemsResult.rows as any[]);

    const samplesDispatched = dispatchRows.length;
    const followUpMissing = dispatchRows.filter((r: any) => !r.follow_up_mail_sent).length;

    // Sales Force items
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

    // Call Reports: detailed items
    const callItemDetailRows = (callItemsResult.rows as any[]);
    const overdueCallRows = (overdueCallsResult.rows as any[]);

    const reportsLogged = callItemDetailRows.length;
    const followUpNeeded = overdueCallRows.length;
    // Next actions due within 3 days: this-week calls with next_steps where window is closing
    const nextActionsDue = callItemDetailRows.filter((r: any) =>
      r.next_steps && String(r.next_steps).trim() &&
      Number(r.days_left) <= 3 && Number(r.days_left) >= 0
    ).length;

    const callItems = [
      // This week's calls — rich detail
      ...callItemDetailRows.map((r: any) => {
        const outcome = String(r.outcome || "").toLowerCase();
        const hasNextSteps = r.next_steps && String(r.next_steps).trim().length > 0;
        const daysLeft = Number(r.days_left ?? 0);
        const commentCount = Number(r.comment_count ?? 0);
        const daysAgo = Number(r.days_ago ?? 0);

        // Secondary detail line
        let detail: string;
        if (hasNextSteps) {
          const actionLabel = String(r.next_steps).trim().slice(0, 60);
          const commentNote = commentCount > 0 ? `, ${commentCount} comment${commentCount > 1 ? "s" : ""}` : ", no comments yet";
          detail = `Outcome: ${r.outcome} · next action "${actionLabel}" due in ${daysLeft}d${commentNote}`;
        } else {
          const summaryLabel = r.summary ? String(r.summary).trim().slice(0, 80) : r.outcome;
          detail = `Outcome: ${r.outcome} · ${summaryLabel}`;
        }

        // Badge
        let status: string;
        if (["success", "interested", "positive"].includes(outcome)) {
          status = hasNextSteps ? "positive" : "on_track";
        } else if (hasNextSteps) {
          status = daysLeft <= 1 ? "overdue" : "on_track";
        } else {
          status = "on_track";
        }

        return {
          company: String(r.company || "Unknown"),
          contact: r.contact_person ? String(r.contact_person) : undefined,
          outcome: String(r.outcome || ""),
          summary: r.summary ? String(r.summary).slice(0, 100) : undefined,
          nextSteps: r.next_steps ? String(r.next_steps).slice(0, 100) : undefined,
          daysAgo,
          daysLeft,
          commentCount,
          detail,
          status,
          isOverdue: false,
        };
      }),
      // Overdue follow-up accounts (not called recently)
      ...overdueCallRows.map((r: any) => ({
        company: String(r.company || "Unknown"),
        contact: r.contact_person ? String(r.contact_person) : undefined,
        outcome: "follow-up needed",
        summary: undefined,
        nextSteps: r.next_steps ? String(r.next_steps).slice(0, 100) : undefined,
        daysAgo: Number(r.days_since ?? 0),
        daysLeft: 0,
        commentCount: 0,
        detail: `Outcome: follow-up needed · no call logged in ${r.days_since} days`,
        status: "overdue",
        isOverdue: true,
      })),
    ];

    // Weekly Activities & Dispatch items
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

    // Project Portfolio items — build task map then attach to projects
    const projectItemRows = (projectItemsResult.rows as any[]);
    const recentTaskRows = (recentTasksResult.rows as any[]);

    // Map project_id → completed task titles this week
    const tasksByProject = new Map<number, string[]>();
    for (const t of recentTaskRows) {
      const pid = Number(t.project_id);
      if (!tasksByProject.has(pid)) tasksByProject.set(pid, []);
      tasksByProject.get(pid)!.push(String(t.title || "Task"));
    }

    const projectItems = projectItemRows.map((r: any) => {
      const tasksDone = Number(r.tasks_done_week ?? 0);
      const inProgress = Number(r.tasks_in_progress ?? 0);
      const tasksUpdated = Number(r.tasks_updated_week ?? 0);
      const doneTitles = tasksByProject.get(Number(r.id)) ?? [];

      // Build secondary summary
      let summary: string;
      if (tasksDone > 0 && doneTitles.length > 0) {
        const taskList = doneTitles.slice(0, 2).join(", ");
        summary = `${tasksDone} task${tasksDone > 1 ? "s" : ""} completed · ${taskList}`;
      } else if (tasksDone > 0) {
        summary = `${tasksDone} task${tasksDone > 1 ? "s" : ""} completed this week`;
      } else if (inProgress > 0) {
        summary = `${inProgress} task${inProgress > 1 ? "s" : ""} in progress · no completions yet`;
      } else if (tasksUpdated > 0) {
        summary = `${tasksUpdated} task${tasksUpdated > 1 ? "s" : ""} updated`;
      } else {
        summary = "Project updated this week";
      }

      // Badge based on project status
      const st = String(r.status || "").toLowerCase();
      let badgeStatus: string;
      if (st === "completed" || st === "pushed_to_live") badgeStatus = "completed";
      else if (st === "on_hold" || st === "awaiting_feedback") badgeStatus = "on_track";
      else badgeStatus = "ongoing";

      return {
        id: Number(r.id),
        name: String(r.name || "Unnamed Project"),
        status: String(r.status || ""),
        productType: r.product_type ? String(r.product_type) : undefined,
        tasksDone,
        tasksInProgress: inProgress,
        recentTaskTitles: doneTitles.slice(0, 3),
        summary,
        badgeStatus,
      };
    });

    // ── Collect unique product types for Oracle Trend Scout ──────────────────
    const productTypeSet = new Set<string>();
    newAccounts.forEach(a => { if ((a as any).productType) productTypeSet.add(String((a as any).productType)); });
    activityRows.forEach((r: any) => { if (r.product_type) productTypeSet.add(String(r.product_type)); });
    projectItemRows.forEach((r: any) => { if (r.product_type) productTypeSet.add(String(r.product_type)); });
    dispatchRows.forEach((r: any) => { if (r.product_type) productTypeSet.add(String(r.product_type)); });
    const activeProductTypes = [...productTypeSet].filter(Boolean).slice(0, 10);

    // ── Oracle narrative brief (Sonnet) ──────────────────────────────────────
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

    // ── Section insights + agent calls in parallel ───────────────────────────
    const complianceCtx = JSON.stringify({
      // Product types currently active in Zentryx's portfolio — drive regulatory focus
      activeProductTypes: activeProductTypes,
      // Internal operational risk flags
      urgentPending: urgentPendingRows.slice(0, 6).map((r: any) => ({ company: r.company, daysPending: r.days_pending, productType: r.product_type })),
      confidenceDrop: confidenceDropRows.slice(0, 6).map((r: any) => ({ company: r.company, confidence: r.confidence })),
      overdueFollowUps: overdueCallRows.slice(0, 4).map((r: any) => ({ company: r.company, daysSince: r.days_since, nextSteps: r.next_steps })),
      samplesWithoutFollowUp: followUpMissing,
    });

    // Trend Scout context: internal signals + Nigeria market trigger
    const trendScoutCtx = JSON.stringify({
      activeProductTypesThisWeek: activeProductTypes,
      newAccounts: newAccounts.slice(0, 6).map(a => ({ company: a.company, productType: a.productType })),
      bdPipeline: bdItemRows.slice(0, 5).map((r: any) => ({ name: r.name, stage: r.stage, customer: r.customer_name })),
      weeklyActivities: activityRows.slice(0, 5).map((r: any) => ({ title: r.project_title, product: r.product_type })),
      weekRange: `${weekStartStr} to ${weekEndStr}`,
    });

    const [salesInsight, callInsight, bdInsight, activitiesInsight, projectInsight, complianceInsight, trendScoutInsight] = await Promise.allSettled([
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this sales and production data for a weekly digest. Be specific.", JSON.stringify({ accounts: ctx.accounts, productionOrders: ctx.productionOrders }), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this call reports data for a weekly digest. Be specific.", JSON.stringify({ totalCalls, successfulCalls, overdueFollowUps: followUpNeeded, nextActionsDue }), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this business development data for a weekly digest. Be specific.", JSON.stringify(ctx.businessDev), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this weekly activities data for a weekly digest. Be specific.", JSON.stringify(ctx.weeklyActivities), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this project portfolio data for a weekly digest. Be specific.", JSON.stringify(ctx.projectPortfolio), 120),
      callModel(SONNET_MODEL, `You are Oracle's Compliance Agent for Zentryx, a food science R&D company in Nigeria. Your job is to give actionable regulatory intelligence specific to the product types Zentryx is currently working on.

Part 1 — Regulatory Updates (lead with this): For each product category listed in activeProductTypes, cite one specific, current NAFDAC regulation, SON standard, or Nigerian food safety requirement that Zentryx should be aware of — e.g. registration requirements, labeling rules, ingredient restrictions, or any recent regulatory changes for that category (bouillons, seasonings, dairy premixes, etc.).

Part 2 — Internal Risk Flags (brief): Flag any urgent pending approvals or overdue client follow-ups from the data.

Keep total response under 130 words. Plain paragraphs, no bullet points or headers.`, complianceCtx, 220),
      // Trend Scout uses Sonnet for quality Nigeria market knowledge
      callModel(SONNET_MODEL, `You are Oracle's Trend Scout Agent for Zentryx, a food science R&D company operating in Nigeria. The following product types were active in Zentryx's portfolio this week. For each product type present in the data, provide one specific signal about its current relevance or trend in the Nigerian food market, combining the internal business signals below with your knowledge of the Nigerian FMCG and food industry. Be specific — name the product category and the trend. Keep total response under 100 words. Plain sentences, no bullets.`, trendScoutCtx, 180),
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
        reportsLogged,
        followUpNeeded,
        nextActionsDue,
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
        items: projectItems,
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
