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

    const [
      newAccounts,
      accountTotalResult,
      ordersResult,
      callsResult,
      bdResult,
      activitiesResult,
      projectsResult,
      tasksResult,
      // Sales Force items
      urgentPendingResult,
      productionOrderItemsResult,  // All new orders this week (full details)
      // Call Reports: detailed per-call + overdue follow-ups
      callItemsResult,
      overdueCallsResult,
      // Weekly Activities & Dispatch
      dispatchItemsResult,
      activityItemsResult,
      // Business dev
      bdItemsResult,
      // Project Portfolio: specific projects with lead + total task counts
      projectItemsResult,
      recentTasksResult,
    ] = await Promise.all([
      // New accounts this week — include id, company, productType, productName
      db
        .select({
          id: accountsTable.id,
          company: accountsTable.company,
          productType: (accountsTable as any).productType,
          productName: (accountsTable as any).productName,
        })
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

      // Urgent pending accounts (approval pending)
      db.execute(sql.raw(`
        SELECT a.id, a.company, a.contact_person, a.product_type,
          EXTRACT(DAY FROM NOW() - a.updated_at)::int AS days_pending
        FROM accounts a
        WHERE a.approval_status = 'not_yet_approved' AND a.urgency_level = 'urgent'
        ORDER BY a.updated_at ASC
        LIMIT 10
      `)).catch(() => ({ rows: [] })),

      // All new production orders this week — full detail (account name, product, volume, dates)
      db.execute(sql.raw(`
        SELECT apo.id, a.id AS account_id, a.company, a.product_name,
          apo.volume, apo.date_ordered, apo.expected_delivery_date, apo.date_delivered
        FROM account_production_orders apo
        JOIN accounts a ON apo.account_id = a.id
        WHERE apo.created_at >= '${weekStart.toISOString()}'
        ORDER BY apo.created_at DESC
        LIMIT 12
      `)).catch(() => ({ rows: [] })),

      // Full call detail rows — includes call_type, summary, next_steps, logged-by, comment count
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

      // Overdue follow-ups: accounts with next_steps on an old call, no call in 14+ days
      db.execute(sql.raw(`
        SELECT DISTINCT ON (cr.account_id)
          a.company, a.contact_person,
          cr.outcome, cr.next_steps, cr.call_type,
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

      // Projects active this week with lead name + all-time task progress.
      // lead_id may be null on many projects; fall back to first entry in assignee_ids.
      db.execute(sql.raw(`
        SELECT
          p.id, p.name, p.status, p.product_type, p.stage,
          COALESCE(
            lu.name,
            au.name
          ) AS lead_name,
          COUNT(t.id) AS total_tasks,
          COUNT(t.id) FILTER (WHERE t.status = 'done') AS total_done,
          COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.updated_at >= '${weekStart.toISOString()}') AS tasks_done_week,
          COUNT(t.id) FILTER (WHERE t.status = 'in_progress') AS tasks_in_progress,
          CASE WHEN p.created_at >= '${weekStart.toISOString()}' THEN true ELSE false END AS is_new
        FROM projects p
        LEFT JOIN users lu ON lu.id = p.lead_id
        LEFT JOIN LATERAL (
          SELECT u2.name FROM users u2
          WHERE p.lead_id IS NULL
            AND p.assignee_ids IS NOT NULL
            AND u2.id = (p.assignee_ids)[1]
          LIMIT 1
        ) au ON true
        LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.updated_at >= '${weekStart.toISOString()}'
           OR p.created_at >= '${weekStart.toISOString()}'
        GROUP BY p.id, p.name, p.status, p.product_type, p.stage, lu.name, au.name
        ORDER BY p.updated_at DESC
        LIMIT 12
      `)).catch(() => ({ rows: [] })),

      // Tasks completed this week — for per-project detail titles
      db.execute(sql.raw(`
        SELECT t.project_id, t.title
        FROM tasks t
        WHERE t.status = 'done'
          AND t.updated_at >= '${weekStart.toISOString()}'
        ORDER BY t.updated_at DESC
        LIMIT 60
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

    const productionOrderRows = (productionOrderItemsResult.rows as any[]);
    const dispatchRows = (dispatchItemsResult.rows as any[]);
    const activityRows = (activityItemsResult.rows as any[]);
    const bdItemRows = (bdItemsResult.rows as any[]);

    const samplesDispatched = dispatchRows.length;
    const followUpMissing = dispatchRows.filter((r: any) => !r.follow_up_mail_sent).length;

    // Sales Force items: urgent pending + new accounts + new production orders
    const salesForceItems = [
      // Urgent pending approvals
      ...urgentPendingRows.map((r: any) => ({
        company: String(r.company || "Unknown"),
        status: "pending_approval",
        detail: r.days_pending != null ? `${r.days_pending}d pending` : undefined,
        accountId: Number(r.id),
      })),
      // Newly added accounts this week (clickable → account page)
      ...newAccounts.map(a => ({
        company: String(a.company || "Unknown"),
        status: "new_account",
        detail: [a.productName, a.productType].filter(Boolean).join(" · ") || undefined,
        accountId: Number(a.id),
      })),
      // New production orders this week with full detail
      ...productionOrderRows.map((r: any) => ({
        company: String(r.company || "Unknown"),
        status: r.date_delivered ? "delivered" : "new_order",
        detail: [
          r.product_name ? String(r.product_name) : null,
          r.volume ? `${Number(r.volume).toLocaleString()} kg` : null,
          r.date_ordered ? `Ordered: ${r.date_ordered}` : null,
          r.expected_delivery_date ? `Expected: ${r.expected_delivery_date}` : null,
        ].filter(Boolean).join(" · ") || undefined,
        accountId: Number(r.account_id),
      })),
    ].slice(0, 15);

    // Call Reports: detailed items — humanise call_type, show logged-by
    const callItemDetailRows = (callItemsResult.rows as any[]);
    const overdueCallRows = (overdueCallsResult.rows as any[]);

    const reportsLogged = callItemDetailRows.length;

    // Follow-up needed: overdue accounts + this-week calls that explicitly need follow-up
    const followUpThisWeek = callItemDetailRows.filter((r: any) => {
      const outcome = String(r.outcome || "").toLowerCase();
      return outcome.includes("follow") || outcome === "follow_up_needed";
    }).length;
    const followUpNeeded = overdueCallRows.length + followUpThisWeek;

    // Next actions due within 3 days: calls this week with next_steps, window closing
    const nextActionsDue = callItemDetailRows.filter((r: any) =>
      r.next_steps && String(r.next_steps).trim() &&
      Number(r.days_left) <= 3 && Number(r.days_left) >= 0
    ).length;

    function humaniseCallType(raw: string): string {
      if (!raw) return "Call";
      return raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    const callItems = [
      ...callItemDetailRows.map((r: any) => {
        const outcome = String(r.outcome || "").toLowerCase();
        const hasNextSteps = r.next_steps && String(r.next_steps).trim().length > 0;
        const daysLeft = Number(r.days_left ?? 0);
        const commentCount = Number(r.comment_count ?? 0);
        const daysAgo = Number(r.days_ago ?? 0);
        const callTypeLabel = humaniseCallType(String(r.call_type || ""));
        const loggedBy = r.created_by_name ? String(r.created_by_name) : undefined;

        // Build secondary detail line
        let detail: string;
        if (hasNextSteps) {
          const actionLabel = String(r.next_steps).trim().slice(0, 60);
          const commentNote = commentCount > 0 ? `, ${commentCount} comment${commentCount > 1 ? "s" : ""}` : ", no comments yet";
          const loggedNote = loggedBy ? ` · Logged by ${loggedBy}` : "";
          detail = `[${callTypeLabel}] Outcome: ${r.outcome} · next action "${actionLabel}" due in ${daysLeft}d${commentNote}${loggedNote}`;
        } else {
          const summaryLabel = r.summary ? String(r.summary).trim().slice(0, 80) : String(r.outcome || "");
          const loggedNote = loggedBy ? ` · Logged by ${loggedBy}` : "";
          detail = `[${callTypeLabel}] Outcome: ${r.outcome} · ${summaryLabel}${loggedNote}`;
        }

        let status: string;
        if (["success", "interested", "positive"].includes(outcome)) {
          status = hasNextSteps ? "positive" : "on_track";
        } else if (outcome.includes("follow")) {
          status = "on_track";
        } else if (hasNextSteps) {
          status = daysLeft <= 1 ? "overdue" : "on_track";
        } else {
          status = "on_track";
        }

        return {
          company: String(r.company || "Unknown"),
          contact: r.contact_person ? String(r.contact_person) : undefined,
          outcome: String(r.outcome || ""),
          callType: callTypeLabel,
          loggedBy,
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
      ...overdueCallRows.map((r: any) => {
        const callTypeLabel = humaniseCallType(String(r.call_type || ""));
        const loggedNote = ""; // no created_by available for overdue query
        return {
          company: String(r.company || "Unknown"),
          contact: r.contact_person ? String(r.contact_person) : undefined,
          outcome: "follow-up needed",
          callType: callTypeLabel,
          loggedBy: undefined,
          nextSteps: r.next_steps ? String(r.next_steps).slice(0, 100) : undefined,
          daysAgo: Number(r.days_since ?? 0),
          daysLeft: 0,
          commentCount: 0,
          detail: `[${callTypeLabel}] Outcome: follow-up needed · no call logged in ${r.days_since} days`,
          status: "overdue",
          isOverdue: true,
        };
      }),
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

    // Project Portfolio items — with progress percentage and lead name
    const projectItemRows = (projectItemsResult.rows as any[]);
    const recentTaskRows = (recentTasksResult.rows as any[]);

    const tasksByProject = new Map<number, string[]>();
    for (const t of recentTaskRows) {
      const pid = Number(t.project_id);
      if (!tasksByProject.has(pid)) tasksByProject.set(pid, []);
      tasksByProject.get(pid)!.push(String(t.title || "Task"));
    }

    const projectItems = projectItemRows.map((r: any) => {
      const tasksDone = Number(r.tasks_done_week ?? 0);
      const totalDone = Number(r.total_done ?? 0);
      const totalTasks = Number(r.total_tasks ?? 0);
      const inProgress = Number(r.tasks_in_progress ?? 0);
      const isNew = r.is_new === true || r.is_new === "true";
      const doneTitles = tasksByProject.get(Number(r.id)) ?? [];

      const progressPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

      let summary: string;
      if (tasksDone > 0) {
        summary = `${tasksDone} task${tasksDone > 1 ? "s" : ""} done this week`;
      } else if (inProgress > 0) {
        summary = `${inProgress} in progress`;
      } else {
        summary = "Updated this week";
      }

      const st = String(r.status || "").toLowerCase();
      let badgeStatus: string;
      if (st === "completed")              badgeStatus = "completed";
      else if (st === "pushed_to_live")    badgeStatus = "pushed_to_live";
      else if (st === "approved")          badgeStatus = "approved";
      else if (st === "on_hold")           badgeStatus = "on_hold";
      else if (st === "awaiting_feedback") badgeStatus = "awaiting_feedback";
      else if (st === "in_review")         badgeStatus = "in_review";
      else if (st === "active")            badgeStatus = "active";
      else if (st === "in_progress")       badgeStatus = "in_progress";
      else                                 badgeStatus = "ongoing";

      return {
        id: Number(r.id),
        name: String(r.name || "Unnamed Project"),
        status: String(r.status || ""),
        productType: r.product_type ? String(r.product_type) : undefined,
        stage: r.stage ? String(r.stage) : undefined,
        leadName: r.lead_name ? String(r.lead_name) : undefined,
        tasksDone,
        totalTasks,
        totalDone,
        tasksInProgress: inProgress,
        recentTaskTitles: doneTitles.slice(0, 1),
        summary,
        badgeStatus,
        progressPct,
        isNew,
      };
    });

    // ── Product types for Oracle agents ─────────────────────────────────────
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
      "You are Oracle, the AI intelligence layer for Zentryx, a food science R&D company. Write a concise, professional weekly digest brief in exactly 3–4 sentences. Summarise business performance across sales, call activity, business development, project portfolio, and team activities. Reference specific numbers from the data only — never fabricate figures. If a metric is missing from the data, omit it rather than estimating. Use a confident, executive tone. Do not use bullet points.",
      `Week data: ${JSON.stringify(ctx)}`,
      400,
    ).catch(() => "Oracle brief unavailable — regenerate to try again.");

    // ── Section insights + agent calls in parallel ───────────────────────────
    const complianceCtx = JSON.stringify({
      activeProductTypes,
      urgentPending: urgentPendingRows.slice(0, 6).map((r: any) => ({ company: r.company, daysPending: r.days_pending, productType: r.product_type })),
      overdueFollowUps: overdueCallRows.slice(0, 4).map((r: any) => ({ company: r.company, daysSince: r.days_since, nextSteps: r.next_steps })),
      samplesWithoutFollowUp: followUpMissing,
    });

    const trendScoutCtx = JSON.stringify({
      productTypesInPortfolio: activeProductTypes,
      weekRange: `${weekStartStr} to ${weekEndStr}`,
    });

    const [salesInsight, callInsight, bdInsight, activitiesInsight, projectInsight, complianceInsight, trendScoutInsight] = await Promise.allSettled([
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this sales and production data for a weekly digest. Use only the numbers present in the data — never fabricate figures. If data is insufficient, say so briefly.", JSON.stringify({ accounts: ctx.accounts, productionOrders: ctx.productionOrders }), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this call reports data for a weekly digest. Use only the numbers present in the data — never fabricate figures. If data is insufficient, say so briefly.", JSON.stringify({ totalCalls, successfulCalls, overdueFollowUps: followUpNeeded, nextActionsDue }), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this business development data for a weekly digest. Use only the numbers present in the data — never fabricate figures. If data is insufficient, say so briefly.", JSON.stringify(ctx.businessDev), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this weekly activities data for a weekly digest. Use only the numbers present in the data — never fabricate figures. If data is insufficient, say so briefly.", JSON.stringify(ctx.weeklyActivities), 120),
      callModel(HAIKU_MODEL, "You are Oracle. Write exactly one insight sentence about this project portfolio data for a weekly digest. Use only the numbers present in the data — never fabricate figures. If data is insufficient, say so briefly.", JSON.stringify(ctx.projectPortfolio), 120),
      callModel(SONNET_MODEL, `You are Oracle's Compliance Agent for Zentryx, a food science R&D company in Nigeria. Your job is to give actionable regulatory intelligence specific to the product types Zentryx is currently working on.

Part 1 — Regulatory Updates (lead with this): For each product category listed in activeProductTypes, cite one specific, current NAFDAC regulation, SON standard, or Nigerian food safety requirement that Zentryx should be aware of — e.g. registration requirements, labeling rules, ingredient restrictions, or any recent regulatory changes for that category (bouillons, seasonings, dairy premixes, etc.).

Part 2 — Internal Risk Flags (brief): Flag any urgent pending approvals or overdue client follow-ups from the data.

Keep total response under 130 words. Plain paragraphs, no bullet points or headers.`, complianceCtx, 220),
      callModel(SONNET_MODEL, `You are Oracle's Trend Scout Agent for Zentryx, a food science R&D company in Nigeria that develops product types such as bouillons, seasonings, dairy premixes, concentrates, savoury flavours, instant drink powders, and similar food ingredients.

Your task has two parts. Write in flowing paragraphs — no bullet points, no headers.

Part 1 — Nigeria Market Trends (lead with this): For each product type listed in productTypesInPortfolio, give one sharp, current trend signal relevant to the Nigerian food market as of 2025–2026. Draw on your knowledge of Nigerian FMCG dynamics, QSR growth, consumer behaviour, and ingredient demand — do not reference specific account names from the data. Keep signals grounded: reference actual market shifts, consumer habits, or industry movements.

Part 2 — Business Leads & Opportunities: Based on your knowledge of the Nigerian food industry, name 2–3 specific company types or named Nigerian companies (e.g. Chicken Republic, Domino's Nigeria, Sweet Sensation, Tolaram/Indomie, Dangote Foods, Chi Limited, Dufil, UAC Foods, Eat'N'Go group, bakery chains) and describe exactly which Zentryx product type each would most likely need right now and why — framed as a concrete sales lead or product pitch opportunity Zentryx should pursue.

Keep total response under 180 words. Plain paragraphs only.`, trendScoutCtx, 320),
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
      "DATA INTEGRITY RULES — MANDATORY: Never fabricate data, figures, or statistics. Distinguish clearly: ✅ Verified fact (from the digest context above), ⚠️ Informed hypothesis (reasoned estimate — label it as such), ❌ Unknown (acknowledge openly and suggest how to find the real answer). If a number is not in the context, do not invent it.",
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
