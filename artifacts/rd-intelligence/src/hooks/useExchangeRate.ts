import { useEffect, useReducer } from "react";

const PRIMARY_API = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_API = "https://api.exchangerate-api.com/v4/latest/USD";
const REFRESH_MS = 10 * 60 * 1000; // 10 minutes

interface Cache {
  rates: Record<string, number>;
  fetchedAt: number | null;
  isLoading: boolean;
  manualNGN: number | null;
}

const storedOverride = (() => {
  try {
    const v = localStorage.getItem("rd_ngn_override");
    return v ? parseFloat(v) : null;
  } catch { return null; }
})();

let cache: Cache = {
  rates: {},
  fetchedAt: null,
  isLoading: false,
  manualNGN: storedOverride,
};

const listeners = new Set<() => void>();
let fetchPromise: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach(fn => fn());
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { fetchPromise = null; fetchRates(); }, REFRESH_MS);
}

async function fetchRates(force = false): Promise<void> {
  if (!force && cache.fetchedAt && Date.now() - cache.fetchedAt < REFRESH_MS) return;
  if (fetchPromise) return fetchPromise;

  cache = { ...cache, isLoading: true };
  notify();

  fetchPromise = (async () => {
    let fetched = false;

    try {
      const res = await fetch(PRIMARY_API);
      if (!res.ok) throw new Error("primary failed");
      const data = await res.json();
      if (data?.rates && typeof data.rates === "object") {
        cache = { ...cache, rates: data.rates, fetchedAt: Date.now(), isLoading: false };
        notify();
        fetched = true;
      }
    } catch {}

    if (!fetched) {
      try {
        const res = await fetch(FALLBACK_API);
        if (!res.ok) throw new Error("fallback failed");
        const data = await res.json();
        if (data?.rates && typeof data.rates === "object") {
          cache = { ...cache, rates: data.rates, fetchedAt: Date.now(), isLoading: false };
          notify();
          fetched = true;
        }
      } catch {}
    }

    if (!fetched) {
      cache = { ...cache, isLoading: false };
      notify();
    }

    scheduleRefresh();
  })().finally(() => { fetchPromise = null; });

  return fetchPromise;
}

fetchRates();

export function useExchangeRate() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    listeners.add(forceUpdate);
    fetchRates();
    return () => { listeners.delete(forceUpdate); };
  }, []);

  const effectiveNGN = cache.manualNGN ?? cache.rates["NGN"] ?? null;

  function convert(usd: number, currency = "NGN"): number | null {
    if (!usd || isNaN(usd)) return null;
    if (currency === "NGN") {
      const rate = cache.manualNGN ?? cache.rates["NGN"] ?? null;
      return rate ? usd * rate : null;
    }
    const rate = cache.rates[currency] ?? null;
    return rate ? usd * rate : null;
  }

  function setManualNGN(rate: number | null) {
    cache = { ...cache, manualNGN: rate };
    try {
      if (rate != null) localStorage.setItem("rd_ngn_override", String(rate));
      else localStorage.removeItem("rd_ngn_override");
    } catch {}
    notify();
  }

  function getLastUpdated(): string {
    if (!cache.fetchedAt) return "";
    const diffMs = Date.now() - cache.fetchedAt;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return `${mins} mins ago`;
  }

  function fmtNGN(usd: number): string {
    if (!usd || isNaN(usd)) return "—";
    const rate = cache.manualNGN ?? cache.rates["NGN"] ?? null;
    if (!rate) return "—";
    const ngn = usd * rate;
    return `₦${ngn.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }

  return {
    rates: cache.rates,
    ngnRate: effectiveNGN,
    isLoading: cache.isLoading,
    fetchedAt: cache.fetchedAt,
    isManualOverride: cache.manualNGN !== null,
    convert,
    fmtNGN,
    setManualNGN,
    getLastUpdated,
    rate: effectiveNGN,
    refresh: () => fetchRates(true),
  };
}

export function fmtNGN(amount: number): string {
  return amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
