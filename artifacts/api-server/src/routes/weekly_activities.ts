import { Router } from "express";
import { db } from "@workspace/db";
import {
  weeklyReportsTable, weeklyActivitiesTable, notificationsTable, usersTable, dispatchRecordsTable
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatWeekLabel(monday: Date, friday: Date): string {
  const m = `${DAYS[monday.getDay()]}, ${MONTHS[monday.getMonth()]} ${monday.getDate()}`;
  const f = `${DAYS[friday.getDay()]}, ${MONTHS[friday.getMonth()]} ${friday.getDate()}, ${friday.getFullYear()}`;
  return `${m} - ${f}`;
}

function generateWeekTemplates(year: number, month: number) {
  const result: any[] = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let cursor = new Date(firstDay);
  const dow = cursor.getDay();
  if (dow !== 1) {
    const daysToMon = dow === 0 ? 1 : 8 - dow;
    cursor.setDate(cursor.getDate() + daysToMon);
  }

  let weekNum = 1;
  while (cursor.getMonth() === month - 1 && cursor <= lastDay) {
    const monday = new Date(cursor);
    const friday = new Date(cursor);
    friday.setDate(friday.getDate() + 4);
    result.push({
      weekNumber: weekNum,
      startDate: monday.toISOString().split("T")[0],
      endDate: friday.toISOString().split("T")[0],
      label: `Week ${weekNum}: ${formatWeekLabel(monday, friday)}`,
      month,
      year,
    });
    weekNum++;
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

router.get("/weeks", requireAuth, async (req: AuthRequest, res) => {
  try {
    const month = parseInt(Array.isArray(req.query.month) ? String(req.query.month[0]) : String(req.query.month)) || new Date().getMonth() + 1;
    const year = parseInt(Array.isArray(req.query.year) ? String(req.query.year[0]) : String(req.query.year)) || new Date().getFullYear();

    const templates = generateWeekTemplates(year, month);
    const existing = await db.select().from(weeklyReportsTable)
      .where(and(eq(weeklyReportsTable.month, month), eq(weeklyReportsTable.year, year)));

    const existingNums = new Set(existing.map(w => w.weekNumber));
    const toCreate = templates.filter(t => !existingNums.has(t.weekNumber));

    if (toCreate.length > 0) {
      await db.insert(weeklyReportsTable).values(toCreate.map(t => ({
        month: t.month, year: t.year, weekNumber: t.weekNumber,
        startDate: t.startDate, endDate: t.endDate, label: t.label, samplesSent: "",
      })));
    }

    const all = await db.select().from(weeklyReportsTable)
      .where(and(eq(weeklyReportsTable.month, month), eq(weeklyReportsTable.year, year)))
      .orderBy(weeklyReportsTable.weekNumber);

    res.json(all);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/weeks/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const { samplesSent } = req.body;
    const [row] = await db.update(weeklyReportsTable)
      .set({ samplesSent: samplesSent ?? "", updatedAt: new Date() })
      .where(eq(weeklyReportsTable.id, id))
      .returning();
    res.json(row);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.get("/weeks/:id/activities", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(_req.params.id) ? _req.params.id[0] : _req.params.id as string);
    const activities = await db.select().from(weeklyActivitiesTable)
      .where(eq(weeklyActivitiesTable.weeklyReportId, id))
      .orderBy(weeklyActivitiesTable.createdAt);
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatar: usersTable.avatar })
      .from(usersTable);
    const userMap = new Map(users.map(u => [u.id, u]));
    const result = activities.map(a => ({
      ...a,
      assignedUser: a.assignedUserId ? (userMap.get(a.assignedUserId) ?? null) : null,
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/weeks/:id/activities", requireAuth, async (req: AuthRequest, res) => {
  try {
    const weeklyReportId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const b = req.body;
    const [row] = await db.insert(weeklyActivitiesTable).values({
      weeklyReportId,
      assignedUserId: b.assignedUserId ?? null,
      projectTitle: b.projectTitle ?? "",
      productType: b.productType ?? null,
      status: b.status ?? "not_started",
      priority: b.priority ?? "medium",
      remarks: b.remarks ?? "",
    }).returning();
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatar: usersTable.avatar }).from(usersTable);
    const userMap = new Map(users.map(u => [u.id, u]));
    res.json({ ...row, assignedUser: row.assignedUserId ? (userMap.get(row.assignedUserId) ?? null) : null });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/activities/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const { createdAt, weeklyReportId, assignedUser, ...rest } = req.body;
    const [row] = await db.update(weeklyActivitiesTable)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(weeklyActivitiesTable.id, id))
      .returning();
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatar: usersTable.avatar }).from(usersTable);
    const userMap = new Map(users.map(u => [u.id, u]));
    res.json({ ...row, assignedUser: row.assignedUserId ? (userMap.get(row.assignedUserId) ?? null) : null });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/activities/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.delete(weeklyActivitiesTable).where(eq(weeklyActivitiesTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

// ──── Dispatch Records ────────────────────────────────────────────────────────

async function withSentBy(records: any[], users: any[]) {
  const userMap = new Map(users.map(u => [u.id, u]));
  return records.map(r => ({
    ...r,
    sentByUser: r.sentByUserId ? (userMap.get(r.sentByUserId) ?? null) : null,
  }));
}

router.get("/dispatch", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const records = await db.select().from(dispatchRecordsTable).orderBy(desc(dispatchRecordsTable.createdAt));
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    res.json(await withSentBy(records, users));
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/dispatch", requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const [row] = await db.insert(dispatchRecordsTable).values({
      sampleCode: b.sampleCode ?? "",
      productDescription: b.productDescription ?? "",
      customer: b.customer ?? "",
      quantity: b.quantity != null ? String(b.quantity) : null,
      sentByUserId: b.sentByUserId ? parseInt(b.sentByUserId) : null,
      dispatchMethod: b.dispatchMethod ?? "",
      productType: b.productType ?? null,
      dateSent: b.dateSent ?? null,
      recipientName: b.recipientName ?? "",
      recipientPhone: b.recipientPhone ?? "",
      recipientMail: b.recipientMail ?? "",
      followUpMailSent: b.followUpMailSent ?? false,
    }).returning();
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    const [enriched] = await withSentBy([row], users);
    res.status(201).json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.put("/dispatch/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const b = req.body;
    const [row] = await db.update(dispatchRecordsTable).set({
      sampleCode: b.sampleCode,
      productDescription: b.productDescription,
      customer: b.customer,
      quantity: b.quantity != null ? String(b.quantity) : null,
      sentByUserId: b.sentByUserId ? parseInt(b.sentByUserId) : null,
      dispatchMethod: b.dispatchMethod,
      productType: b.productType ?? null,
      dateSent: b.dateSent ?? null,
      recipientName: b.recipientName,
      recipientPhone: b.recipientPhone,
      recipientMail: b.recipientMail,
      followUpMailSent: b.followUpMailSent ?? false,
      updatedAt: new Date(),
    }).where(eq(dispatchRecordsTable.id, id)).returning();
    const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
    const [enriched] = await withSentBy([row], users);
    res.json(enriched);
  } catch (e) { console.error(e); res.status(500).json({ error: "InternalServerError" }); }
});

router.delete("/dispatch/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.delete(dispatchRecordsTable).where(eq(dispatchRecordsTable.id, id));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

// ──────────────────────────────────────────────────────────────────────────────

router.post("/notify", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { userIds, title, message } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: "No users selected" });
      return;
    }
    const notifs = (userIds as number[]).map(userId => ({
      userId,
      type: "system" as const,
      title: title || "Weekly Activity Notification",
      message: message || "You have a new notification.",
      isRead: false,
    }));
    await db.insert(notificationsTable).values(notifs);
    res.json({ success: true, sent: userIds.length });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
