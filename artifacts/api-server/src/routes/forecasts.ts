import { Router } from "express";
import { db } from "@workspace/db";
import { accountForecastsTable, notificationsTable, accountsTable, accountProductionOrdersTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const forecasts = await db.select().from(accountForecastsTable)
      .orderBy(desc(accountForecastsTable.forecastDate));
    res.json(forecasts);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const b = req.body;
    const [f] = await db.insert(accountForecastsTable).values({
      accountId: b.accountId || null,
      company: b.company,
      productName: b.productName,
      productType: b.productType || null,
      customerType: b.customerType || null,
      isStrategic: !!b.isStrategic,
      lastOrderDate: b.lastOrderDate || null,
      lastOrderVolume: b.lastOrderVolume || null,
      forecastDate: b.forecastDate,
      forecastVolume: b.forecastVolume || null,
      confidence: b.confidence ?? 50,
      status: b.status ?? "pending",
      notes: b.notes || null,
    }).returning();
    res.json(f);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.put("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    const { createdAt, ...rest } = req.body;
    const [f] = await db.update(accountForecastsTable)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(accountForecastsTable.id, id))
      .returning();
    res.json(f);
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id as string);
    await db.delete(accountForecastsTable).where(eq(accountForecastsTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

function parseDMY(s: string | null | undefined): Date | null {
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return isNaN(date.getTime()) ? null : date;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function popStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateConfidence(dated: { date: Date; vol: number }[]): number {
  const n = dated.length;
  if (n < 2) return 10;

  // ── Step 1: Order Interval Consistency ──────────────────────────────
  const gaps: number[] = [];
  for (let i = 1; i < n; i++) {
    gaps.push((dated[i].date.getTime() - dated[i - 1].date.getTime()) / 86400000);
  }
  const avgInterval = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sdInterval = popStdDev(gaps);
  const consistencyScore = avgInterval > 0
    ? clamp(100 - (sdInterval / avgInterval) * 100, 0, 100)
    : 0;

  // ── Step 2: Data Volume Score ────────────────────────────────────────
  let dataVolumeScore: number;
  if (n >= 10) dataVolumeScore = 100;
  else if (n >= 5) dataVolumeScore = 70;
  else if (n >= 3) dataVolumeScore = 50;
  else dataVolumeScore = 30; // n === 2

  // ── Step 3: Volume Stability ─────────────────────────────────────────
  const vols = dated.map(o => o.vol).filter(v => v > 0);
  const hasVolume = vols.length >= 2;
  let volumeStability = 0;
  if (hasVolume) {
    const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
    const sdVol = popStdDev(vols);
    volumeStability = avgVol > 0
      ? clamp(100 - (sdVol / avgVol) * 100, 0, 100)
      : 0;
  }

  // ── Step 4: Weighted Final Score ─────────────────────────────────────
  let confidence: number;
  if (hasVolume) {
    confidence = (consistencyScore * 0.4) + (dataVolumeScore * 0.3) + (volumeStability * 0.3);
  } else {
    // Reweight: distribute the 0.3 volume weight between remaining factors
    confidence = (consistencyScore * (4 / 7)) + (dataVolumeScore * (3 / 7));
  }

  return Math.round(confidence);
}

router.post("/seed", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const accounts = await db.select().from(accountsTable)
      .where(eq(accountsTable.isActive, true));

    for (const account of accounts) {
      const allOrders = await db.select().from(accountProductionOrdersTable)
        .where(eq(accountProductionOrdersTable.accountId, account.id))
        .orderBy(asc(accountProductionOrdersTable.createdAt));

      const dated = allOrders
        .map(o => ({ date: parseDMY(o.dateOrdered), vol: parseFloat(o.volume || "0"), raw: o }))
        .filter(o => o.date !== null)
        .sort((a, b) => a.date!.getTime() - b.date!.getTime());

      let forecastDateStr: string;
      let forecastVolumeStr: string;
      let lastOrderDate: string | null = null;
      let lastOrderVolume: string | null = null;
      let confidence: number;

      if (dated.length === 0) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        forecastDateStr = d.toISOString().split("T")[0];
        forecastVolumeStr = account.volume ?? "0";
        confidence = 10;
      } else if (dated.length === 1) {
        const lo = dated[0];
        lastOrderDate = lo.raw.dateOrdered;
        lastOrderVolume = String(lo.vol);
        const fd = new Date(lo.date!);
        fd.setDate(fd.getDate() + 30);
        forecastDateStr = fd.toISOString().split("T")[0];
        forecastVolumeStr = String(lo.vol);
        confidence = 10;
      } else {
        const lo = dated[dated.length - 1];
        lastOrderDate = lo.raw.dateOrdered;
        lastOrderVolume = String(lo.vol);

        const gaps: number[] = [];
        for (let i = 1; i < dated.length; i++) {
          gaps.push((dated[i].date!.getTime() - dated[i - 1].date!.getTime()) / 86400000);
        }
        const avgDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);

        const growthChanges: number[] = [];
        for (let i = 1; i < dated.length; i++) {
          growthChanges.push(dated[i].vol - dated[i - 1].vol);
        }
        const avgGrowth = growthChanges.reduce((a, b) => a + b, 0) / growthChanges.length;

        const fd = new Date(lo.date!);
        fd.setDate(fd.getDate() + avgDays);
        forecastDateStr = fd.toISOString().split("T")[0];

        const forecastVol = Math.max(0, lo.vol + avgGrowth);
        forecastVolumeStr = (Math.round(forecastVol * 100) / 100).toString();

        confidence = calculateConfidence(dated.map(o => ({ date: o.date!, vol: o.vol })));
      }

      const existing = await db.select({ id: accountForecastsTable.id })
        .from(accountForecastsTable)
        .where(eq(accountForecastsTable.accountId, account.id))
        .limit(1);

      if (existing.length > 0) {
        await db.update(accountForecastsTable).set({
          company: account.company,
          productName: account.productName,
          productType: account.productType ?? null,
          customerType: account.customerType ?? null,
          isStrategic: account.customerType === "existing",
          lastOrderDate,
          lastOrderVolume,
          forecastDate: forecastDateStr,
          forecastVolume: forecastVolumeStr,
          confidence,
          updatedAt: new Date(),
        }).where(eq(accountForecastsTable.accountId, account.id));
      } else {
        await db.insert(accountForecastsTable).values({
          accountId: account.id,
          company: account.company,
          productName: account.productName,
          productType: account.productType ?? null,
          customerType: account.customerType ?? null,
          isStrategic: account.customerType === "existing",
          lastOrderDate,
          lastOrderVolume,
          forecastDate: forecastDateStr,
          forecastVolume: forecastVolumeStr,
          confidence,
          status: "pending",
        });
      }
    }

    const all = await db.select().from(accountForecastsTable)
      .orderBy(desc(accountForecastsTable.forecastDate));
    res.json(all);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "InternalServerError" });
  }
});

router.post("/notify-procurement", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { userIds, title, message } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: "No users selected" });
      return;
    }
    const notifs = (userIds as number[]).map(userId => ({
      userId,
      type: "system" as const,
      title: title || "Procurement Notification",
      message: message || "You have a new procurement notification.",
      isRead: false,
    }));
    await db.insert(notificationsTable).values(notifs);
    res.json({ success: true, sent: userIds.length });
  } catch {
    res.status(500).json({ error: "InternalServerError" });
  }
});

export default router;
