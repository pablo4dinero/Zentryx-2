import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import {
  Rss, LayoutGrid, List, ChevronLeft, ChevronRight,
  RefreshCw, Clock, TrendingUp, TrendingDown, Minus,
  Layers, AlertCircle, ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL;

interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  category: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "neutral" | "negative";
  imageKeyword: string;
  imageUrl?: string;
  readMoreUrl?: string;
  readTime: number;
}

type ViewMode = "slider" | "grid" | "list";

const CATEGORY_COLORS: Record<string, { gradient: string; dark: string; light: string }> = {
  "Food Tech":      { gradient: "from-blue-600 to-cyan-500",    dark: "bg-blue-500/20 text-blue-300 border-blue-500/30",    light: "bg-blue-100 text-blue-700 border-blue-200" },
  "Market":         { gradient: "from-amber-500 to-orange-500",  dark: "bg-amber-500/20 text-amber-300 border-amber-500/30", light: "bg-amber-100 text-amber-700 border-amber-200" },
  "Regulation":     { gradient: "from-red-600 to-rose-500",      dark: "bg-red-500/20 text-red-300 border-red-500/30",       light: "bg-red-100 text-red-700 border-red-200" },
  "Sustainability": { gradient: "from-emerald-600 to-green-500", dark: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", light: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  "Innovation":     { gradient: "from-purple-600 to-violet-500", dark: "bg-purple-500/20 text-purple-300 border-purple-500/30", light: "bg-purple-100 text-purple-700 border-purple-200" },
  "Ingredients":    { gradient: "from-teal-600 to-cyan-500",     dark: "bg-teal-500/20 text-teal-300 border-teal-500/30",    light: "bg-teal-100 text-teal-700 border-teal-200" },
};

const SENTIMENT = {
  positive: { icon: TrendingUp,   darkClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", lightClass: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Positive" },
  neutral:  { icon: Minus,        darkClass: "bg-slate-500/20 text-slate-300 border-slate-500/30",       lightClass: "bg-slate-100 text-slate-600 border-slate-200",       label: "Neutral" },
  negative: { icon: TrendingDown, darkClass: "bg-red-500/20 text-red-300 border-red-500/30",             lightClass: "bg-red-100 text-red-700 border-red-200",             label: "Negative" },
};

function catColors(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS["Food Tech"];
}

function useRelativeTime(isoStr: string | null): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!isoStr) { setLabel(""); return; }
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
      if (secs < 60) setLabel("Updated just now");
      else if (secs < 3600) setLabel(`Updated ${Math.floor(secs / 60)}m ago`);
      else setLabel(`Updated ${Math.floor(secs / 3600)}h ago`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [isoStr]);
  return label;
}

// ─── Card Image component with gradient fallback ─────────────────────────────

function CardImage({ item, className }: { item: NewsItem; className?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const cat = catColors(item.category);

  return (
    <div className={cn(`relative bg-gradient-to-br ${cat.gradient} overflow-hidden`, className)}>
      {item.imageUrl && !imgFailed && (
        <img
          src={item.imageUrl}
          alt={item.imageKeyword}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
      {/* Overlay for text contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />
      {/* Watermark when no image */}
      {(!item.imageUrl || imgFailed) && (
        <span className="absolute inset-0 flex items-center justify-center text-white/10 font-black text-6xl uppercase tracking-widest select-none pointer-events-none">
          {item.category.split(" ")[0]}
        </span>
      )}
    </div>
  );
}

// ─── Fan / CSS Slider ─────────────────────────────────────────────────────────

function SliderCard({ item, isActive, isLight }: { item: NewsItem; isActive: boolean; isLight: boolean }) {
  const cat = catColors(item.category);
  const sent = SENTIMENT[item.sentiment] || SENTIMENT.neutral;
  const SentIcon = sent.icon;
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden flex flex-col h-full select-none",
      isLight ? "bg-white" : "bg-[#151525]",
      isActive
        ? isLight ? "shadow-2xl ring-2 ring-primary/30" : "shadow-2xl shadow-primary/10 border border-primary/20"
        : isLight ? "shadow-lg border border-gray-100" : "border border-white/10",
    )}>
      {/* Image area */}
      <div className="relative flex-shrink-0" style={{ height: isActive ? 200 : 170 }}>
        <CardImage item={item} className="absolute inset-0 w-full h-full" />
        {/* Category + sentiment badges */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between z-10">
          <span className="text-[10px] font-bold text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
            {item.category}
          </span>
          <span className={cn(
            "flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm",
            item.sentiment === "positive" ? "bg-emerald-500/40 text-emerald-100" :
            item.sentiment === "negative" ? "bg-red-500/40 text-red-100" :
            "bg-white/20 text-white/80",
          )}>
            <SentIcon className="w-2.5 h-2.5" />
            {sent.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className={cn(
          "font-bold leading-snug",
          isActive ? "text-[15px] line-clamp-3" : "text-[13px] line-clamp-2",
          isLight ? "text-gray-900" : "text-white",
        )}>
          {item.headline}
        </h3>

        {isActive && (
          <p className={cn("text-xs leading-relaxed line-clamp-2 flex-1", isLight ? "text-gray-500" : "text-gray-400")}>
            {item.summary}
          </p>
        )}

        <div className={cn("flex items-center justify-between mt-auto pt-2 border-t text-[11px]",
          isLight ? "border-gray-100 text-gray-400" : "border-white/5 text-gray-500",
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate font-medium">{item.source}</span>
            <span className="flex items-center gap-0.5 shrink-0"><Clock className="w-3 h-3" />{item.readTime}m</span>
          </div>
          {isActive && item.readMoreUrl && (
            <a
              href={item.readMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="shrink-0 flex items-center gap-1 text-primary hover:underline font-semibold ml-2"
            >
              Read more <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderView({ items, isLight }: { items: NewsItem[]; isLight: boolean }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const n = items.length;

  useEffect(() => {
    if (isPaused || n === 0) return;
    const id = setInterval(() => setCurrentIdx(i => (i + 1) % n), 5000);
    return () => clearInterval(id);
  }, [isPaused, n]);

  const prev = () => setCurrentIdx(i => (i - 1 + n) % n);
  const next = () => setCurrentIdx(i => (i + 1) % n);

  // Render 7 slots (-3 to +3); ±3 are invisible buffers for smooth entry/exit
  const slots = [-3, -2, -1, 0, 1, 2, 3];

  const slotStyle = (d: number): React.CSSProperties => {
    const abs = Math.abs(d);
    const xOffsets   = [0,   200,  380,  530];
    const scales     = [1,   0.84, 0.70, 0.58];
    const opacities  = [1,   0.80, 0.55, 0];
    const zIndexes   = [20,  12,   6,    1];
    const idx = Math.min(abs, 3);

    return {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: "272px",
      transform: `translate(calc(-50% + ${d < 0 ? -xOffsets[idx] : xOffsets[idx]}px), -50%) scale(${scales[idx]})`,
      opacity: opacities[idx],
      zIndex: zIndexes[idx],
      transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      pointerEvents: abs > 2 ? "none" : "auto",
      height: d === 0 ? "420px" : "390px",
    };
  };

  const slotItems = slots.map(d => ({
    d,
    item: items[(currentIdx + d + n) % n],
  }));

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "460px" }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {slotItems.map(({ d, item }) => (
        <div
          key={item.id}
          style={slotStyle(d)}
          onClick={() => { if (d !== 0) setCurrentIdx((currentIdx + d + n) % n); }}
          className={d !== 0 ? "cursor-pointer" : ""}
        >
          <SliderCard item={item} isActive={d === 0} isLight={isLight} />
        </div>
      ))}

      {/* Prev / Next */}
      <button
        onClick={prev}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white transition-all shadow-lg"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={next}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white transition-all shadow-lg"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-30">
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIdx(idx)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              idx === currentIdx
                ? "w-5 bg-primary"
                : isLight ? "w-1.5 bg-slate-400/50" : "w-1.5 bg-white/25",
            )}
          />
        ))}
      </div>

      {/* Slide counter */}
      <p className={cn("absolute bottom-7 right-4 text-xs z-30", isLight ? "text-slate-400" : "text-gray-500")}>
        {currentIdx + 1} / {n}
      </p>
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────────

function GridCard({ item, isLight }: { item: NewsItem; isLight: boolean }) {
  const sent = SENTIMENT[item.sentiment] || SENTIMENT.neutral;
  const SentIcon = sent.icon;
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
      isLight ? "bg-white shadow-md border border-gray-100" : "bg-[#151525] border border-white/10 hover:border-white/20",
    )}>
      {/* Image */}
      <div className="relative h-40 flex-shrink-0">
        <CardImage item={item} className="absolute inset-0 w-full h-full" />
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between z-10">
          <span className="text-[10px] font-bold text-white bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
            {item.category}
          </span>
          <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm",
            item.sentiment === "positive" ? "bg-emerald-500/40 text-emerald-100" :
            item.sentiment === "negative" ? "bg-red-500/40 text-red-100" :
            "bg-white/20 text-white/80",
          )}>
            <SentIcon className="w-2.5 h-2.5" />
            {sent.label}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className={cn("font-semibold text-sm leading-snug line-clamp-3 mb-2 flex-1", isLight ? "text-gray-900" : "text-white")}>
          {item.headline}
        </h3>
        <p className={cn("text-xs leading-relaxed line-clamp-2 mb-3", isLight ? "text-gray-500" : "text-gray-400")}>
          {item.summary}
        </p>
        <div className={cn("flex items-center justify-between text-[11px] pt-3 border-t",
          isLight ? "border-gray-100 text-gray-400" : "border-white/5 text-gray-500",
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate font-medium">{item.source}</span>
            <span className="flex items-center gap-0.5 shrink-0"><Clock className="w-3 h-3" />{item.readTime}m</span>
          </div>
          {item.readMoreUrl && (
            <a
              href={item.readMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-primary hover:underline font-semibold ml-2"
            >
              Read more <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function GridView({ items, isLight }: { items: NewsItem[]; isLight: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
        >
          <GridCard item={item} isLight={isLight} />
        </motion.div>
      ))}
    </div>
  );
}

// ─── List ──────────────────────────────────────────────────────────────────────

function ListRow({ item, isLight }: { item: NewsItem; isLight: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const cat = catColors(item.category);
  const sent = SENTIMENT[item.sentiment] || SENTIMENT.neutral;
  const SentIcon = sent.icon;
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "flex items-stretch gap-0 rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-x-0.5",
      isLight ? "bg-white shadow-sm border border-gray-100 hover:shadow-md" : "bg-[#151525] border border-white/10 hover:border-white/20",
    )}>
      {/* Thumbnail */}
      <div className={`relative w-24 sm:w-32 flex-shrink-0 bg-gradient-to-br ${cat.gradient}`}>
        {item.imageUrl && !imgFailed && (
          <img
            src={item.imageUrl}
            alt={item.imageKeyword}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", isLight ? cat.light : cat.dark)}>
            {item.category}
          </span>
          <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
            isLight ? sent.lightClass : sent.darkClass,
          )}>
            <SentIcon className="w-2.5 h-2.5" />
            {sent.label}
          </span>
        </div>
        <h3 className={cn("font-semibold text-sm leading-snug line-clamp-2", isLight ? "text-gray-900" : "text-white")}>
          {item.headline}
        </h3>
        <p className={cn("text-xs leading-relaxed line-clamp-1", isLight ? "text-gray-500" : "text-gray-400")}>
          {item.summary}
        </p>
      </div>

      {/* Right meta */}
      <div className={cn("shrink-0 flex flex-col items-end justify-between p-3 sm:p-4 text-[11px]",
        isLight ? "text-gray-400" : "text-gray-500",
      )}>
        <div className="text-right">
          <p className="font-medium">{item.source}</p>
          <p className="mt-0.5">{timeAgo}</p>
          <p className="flex items-center gap-0.5 mt-0.5 justify-end"><Clock className="w-3 h-3" />{item.readTime}m</p>
        </div>
        {item.readMoreUrl && (
          <a
            href={item.readMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline font-semibold mt-2"
          >
            Read more <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function ListView({ items, isLight }: { items: NewsItem[]; isLight: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, delay: i * 0.03 }}
        >
          <ListRow item={item} isLight={isLight} />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg", className)} />;
}

function SkeletonView({ view, isLight }: { view: ViewMode; isLight: boolean }) {
  const base = isLight ? "bg-slate-200" : "bg-white/8";
  const card = isLight ? "bg-white border border-gray-100 shadow-sm" : "bg-[#151525] border border-white/10";

  if (view === "slider") {
    return (
      <div className="relative overflow-hidden" style={{ height: "460px" }}>
        {/* Side cards */}
        {[-1, 0, 1].map(d => (
          <div
            key={d}
            style={{
              position: "absolute", left: "50%", top: "50%",
              width: "272px",
              transform: `translate(calc(-50% + ${d * 200}px), -50%) scale(${d === 0 ? 1 : 0.84})`,
              opacity: d === 0 ? 1 : 0.5, zIndex: d === 0 ? 10 : 5,
            }}
            className={cn("rounded-2xl overflow-hidden h-[400px]", card)}
          >
            <Skeleton className={cn("h-48 w-full rounded-none", base)} />
            <div className="p-4 space-y-3">
              <Skeleton className={cn("h-4 w-full", base)} />
              <Skeleton className={cn("h-4 w-4/5", base)} />
              <Skeleton className={cn("h-3 w-3/5", base)} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (view === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={cn("rounded-2xl overflow-hidden", card)}>
            <Skeleton className={cn("h-40", base)} />
            <div className="p-4 space-y-2">
              <Skeleton className={cn("h-4 w-full", base)} />
              <Skeleton className={cn("h-4 w-4/5", base)} />
              <Skeleton className={cn("h-3 w-full", base)} />
              <div className="flex justify-between pt-2 border-t border-white/5">
                <Skeleton className={cn("h-3 w-20", base)} />
                <Skeleton className={cn("h-3 w-16", base)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className={cn("flex rounded-2xl overflow-hidden", card)} style={{ height: 96 }}>
          <Skeleton className={cn("w-24 sm:w-32 flex-shrink-0 rounded-none", base)} />
          <div className="flex-1 p-3 sm:p-4 space-y-2">
            <Skeleton className={cn("h-3 w-24 rounded-full", base)} />
            <Skeleton className={cn("h-4 w-full", base)} />
            <Skeleton className={cn("h-3 w-4/5", base)} />
          </div>
          <div className="p-3 sm:p-4 space-y-1.5 w-28 flex-shrink-0">
            <Skeleton className={cn("h-3 w-full", base)} />
            <Skeleton className={cn("h-3 w-3/4", base)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewsFeed() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [view, setView] = useState<ViewMode>("slider");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updatedLabel = useRelativeTime(fetchedAt);

  const fetchNews = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else { setLoading(true); setError(null); }

    try {
      const res = await fetch(`${BASE}api/newsfeed`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
      });
      if (!res.ok) throw new Error("Failed to load news feed");
      const data = await res.json() as { items: NewsItem[]; fetchedAt: string };
      setItems(data.items || []);
      setFetchedAt(data.fetchedAt);
    } catch {
      if (!isBackground) setError("Could not load news feed. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  useEffect(() => {
    const id = setInterval(() => fetchNews(true), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchNews]);

  const VIEW_OPTIONS: { key: ViewMode; icon: React.ElementType; label: string }[] = [
    { key: "slider", icon: Layers,      label: "Slider" },
    { key: "grid",   icon: LayoutGrid,  label: "Grid" },
    { key: "list",   icon: List,        label: "List" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
            <Rss className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={cn("text-xl font-bold", isLight ? "text-gray-900" : "text-white")}>News Feed</h1>
            <p className={cn("text-xs mt-0.5", isLight ? "text-gray-500" : "text-gray-400")}>
              Nigeria & Africa food industry intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {fetchedAt && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border",
              isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/5 border-white/10 text-gray-400",
            )}>
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : updatedLabel}
            </div>
          )}

          <button
            onClick={() => fetchNews(true)}
            disabled={loading || refreshing}
            title="Refresh now"
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center border transition-colors disabled:opacity-40",
              isLight ? "border-slate-200 text-slate-500 hover:bg-slate-100" : "border-white/10 text-gray-400 hover:bg-white/10",
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          </button>

          <div className={cn("flex items-center rounded-xl p-1 gap-0.5 border", isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/10")}>
            {VIEW_OPTIONS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                title={label}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                  view === key
                    ? isLight ? "bg-white shadow-sm text-primary border border-slate-200" : "bg-primary/15 text-primary border border-primary/20"
                    : isLight ? "text-slate-400 hover:text-slate-600" : "text-gray-500 hover:text-gray-300",
                )}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonView view={view} isLight={isLight} />
      ) : error ? (
        <div className={cn(
          "flex flex-col items-center justify-center gap-3 py-20 rounded-2xl border",
          isLight ? "bg-white border-gray-100" : "bg-[#151525] border-white/10",
        )}>
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className={cn("font-medium", isLight ? "text-gray-700" : "text-gray-300")}>{error}</p>
          <button onClick={() => fetchNews()} className="text-sm text-primary hover:underline">
            Try again
          </button>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {view === "slider" && <SliderView items={items} isLight={isLight} />}
            {view === "grid"   && <GridView   items={items} isLight={isLight} />}
            {view === "list"   && <ListView   items={items} isLight={isLight} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
