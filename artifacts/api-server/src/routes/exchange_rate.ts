import { Router } from "express";
import { requireAuth } from "../lib/auth";

const router = Router();

const PRIMARY_API  = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_API = "https://api.exchangerate-api.com/v4/latest/USD";
const CACHE_MS     = 10 * 60 * 1000; // 10 min — no point polling faster

let cache: { rates: Record<string, number>; fetchedAt: number } | null = null;

router.get("/", requireAuth, async (_req, res) => {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) {
    return res.json({ rates: cache.rates, fetchedAt: new Date(cache.fetchedAt).toISOString() });
  }

  for (const url of [PRIMARY_API, FALLBACK_API]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data = await r.json() as { rates?: Record<string, number>; conversion_rates?: Record<string, number> };
      const rates = data.rates ?? data.conversion_rates ?? null;
      if (rates && typeof rates === "object") {
        cache = { rates, fetchedAt: now };
        return res.json({ rates, fetchedAt: new Date(now).toISOString() });
      }
    } catch {
      // try next
    }
  }

  // Both failed — return stale cache if we have it, otherwise 503
  if (cache) {
    return res.json({ rates: cache.rates, fetchedAt: new Date(cache.fetchedAt).toISOString(), stale: true });
  }
  res.status(503).json({ error: "Exchange rate service unavailable" });
});

export default router;
