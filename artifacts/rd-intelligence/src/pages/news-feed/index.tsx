import { useState, useEffect, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import {
  Rss, LayoutGrid, List, ChevronLeft, ChevronRight,
  RefreshCw, Clock, TrendingUp, TrendingDown, Minus,
  GalleryHorizontal, AlertCircle,
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
  readTime: number;
}

type ViewMode = "carousel" | "grid" | "list";

const CATEGORY_COLORS: Record<string, { gradient: string; dark: string; light: string; dot: string }> = {
  "Food Tech":      { gradient: "from-blue-600 to-cyan-500",    dark: "bg-blue-500/20 text-blue-300 border-blue-500/30",    light: "bg-blue-100 text-blue-700 border-blue-200",    dot: "bg-blue-500" },
  "Market":         { gradient: "from-amber-500 to-orange-500",  dark: "bg-amber-500/20 text-amber-300 border-amber-500/30", light: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  "Regulation":     { gradient: "from-red-600 to-rose-500",      dark: "bg-red-500/20 text-red-300 border-red-500/30",       light: "bg-red-100 text-red-700 border-red-200",       dot: "bg-red-500" },
  "Sustainability": { gradient: "from-emerald-600 to-green-500", dark: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", light: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  "Innovation":     { gradient: "from-purple-600 to-violet-500", dark: "bg-purple-500/20 text-purple-300 border-purple-500/30", light: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  "Ingredients":    { gradient: "from-teal-600 to-cyan-500",     dark: "bg-teal-500/20 text-teal-300 border-teal-500/30",    light: "bg-teal-100 text-teal-700 border-teal-200",    dot: "bg-teal-500" },
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

// ─── Carousel ─────────────────────────────────────────────────────────────────

function CarouselCard({ item, isLight }: { item: NewsItem; isLight: boolean }) {
  const cat = catColors(item.category);
  const sent = SENTIMENT[item.sentiment] || SENTIMENT.neutral;
  const SentIcon = sent.icon;
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden select-none h-full",
      isLight ? "bg-white shadow-xl border border-gray-100" : "bg-[#151525] border border-white/10",
    )}>
      {/* Gradient header */}
      <div className={`relative h-52 sm:h-60 bg-gradient-to-br ${cat.gradient} p-5 flex flex-col justify-between overflow-hidden`}>
        {/* Watermark */}
        <span className="absolute inset-0 flex items-center justify-center text-white/10 font-black text-7xl sm:text-[96px] uppercase tracking-widest pointer-events-none select-none">
          {item.category.split(" ")[0]}
        </span>
        {/* Top row */}
        <div className="relative flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white/95 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full border border-white/30">
            {item.category}
          </span>
          <span className={cn(
            "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm border",
            item.sentiment === "positive" ? "bg-emerald-500/30 text-emerald-100 border-emerald-400/30" :
            item.sentiment === "negative" ? "bg-red-500/30 text-red-100 border-red-400/30" :
            "bg-white/20 text-white/80 border-white/20",
          )}>
            <SentIcon className="w-3 h-3" />
            {sent.label}
          </span>
        </div>
        {/* Bottom row */}
        <div className="relative flex items-center gap-3 text-white/75 text-xs">
          <span className="font-medium">{item.source}</span>
          <span>·</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.readTime} min read</span>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 sm:p-6">
        <h2 className={cn("text-lg sm:text-xl font-bold leading-snug mb-3 line-clamp-3", isLight ? "text-gray-900" : "text-white")}>
          {item.headline}
        </h2>
        <p className={cn("text-sm leading-relaxed line-clamp-3 mb-4", isLight ? "text-gray-600" : "text-gray-400")}>
          {item.summary}
        </p>
        <p className={cn("text-xs", isLight ? "text-gray-400" : "text-gray-500")}>{timeAgo}</p>
      </div>
    </div>
  );
}

function CarouselView({ items, isLight }: { items: NewsItem[]; isLight: boolean }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, duration: 28 });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setCurrentIdx(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || isPaused) return;
    const id = setInterval(() => emblaApi.scrollNext(), 5000);
    return () => clearInterval(id);
  }, [emblaApi, isPaused]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Embla viewport */}
      <div ref={emblaRef} className="overflow-hidden rounded-2xl">
        <div className="flex">
          {items.map(item => (
            <div key={item.id} className="flex-[0_0_100%] min-w-0">
              <CarouselCard item={item} isLight={isLight} />
            </div>
          ))}
        </div>
      </div>

      {/* Prev / Next */}
      <button
        onClick={() => emblaApi?.scrollPrev()}
        className="absolute left-3 top-[calc(50%-1.5rem)] -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-sm flex items-center justify-center text-white transition-all shadow-lg"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-3 top-[calc(50%-1.5rem)] -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-sm flex items-center justify-center text-white transition-all shadow-lg"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dot indicators */}
      <div className="flex justify-center items-center gap-1.5 mt-4">
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={() => emblaApi?.scrollTo(idx)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              idx === currentIdx
                ? "w-5 bg-primary"
                : isLight ? "w-1.5 bg-slate-300" : "w-1.5 bg-white/20",
            )}
          />
        ))}
      </div>

      {/* Slide counter */}
      <p className={cn("text-center text-xs mt-2", isLight ? "text-slate-400" : "text-gray-500")}>
        {currentIdx + 1} of {items.length}
      </p>
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────────

function GridCard({ item, isLight }: { item: NewsItem; isLight: boolean }) {
  const cat = catColors(item.category);
  const sent = SENTIMENT[item.sentiment] || SENTIMENT.neutral;
  const SentIcon = sent.icon;
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
      isLight ? "bg-white shadow-md border border-gray-100" : "bg-[#151525] border border-white/10 hover:border-white/20",
    )}>
      {/* Category colour strip */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${cat.gradient}`} />

      <div className="p-4 sm:p-5 flex flex-col flex-1">
        {/* Badges row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full border", isLight ? cat.light : cat.dark)}>
            {item.category}
          </span>
          <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border", isLight ? sent.lightClass : sent.darkClass)}>
            <SentIcon className="w-2.5 h-2.5" />
            {sent.label}
          </span>
        </div>

        {/* Headline */}
        <h3 className={cn("font-semibold text-sm leading-snug line-clamp-3 mb-2 flex-1", isLight ? "text-gray-900" : "text-white")}>
          {item.headline}
        </h3>

        {/* Summary */}
        <p className={cn("text-xs leading-relaxed line-clamp-3 mb-4", isLight ? "text-gray-500" : "text-gray-400")}>
          {item.summary}
        </p>

        {/* Footer */}
        <div className={cn("flex items-center justify-between text-[11px] pt-3 border-t", isLight ? "border-gray-100 text-gray-400" : "border-white/5 text-gray-500")}>
          <span className="font-medium truncate mr-2">{item.source}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span>{timeAgo}</span>
            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{item.readTime}m</span>
          </div>
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
  const cat = catColors(item.category);
  const sent = SENTIMENT[item.sentiment] || SENTIMENT.neutral;
  const SentIcon = sent.icon;
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "flex items-start gap-4 p-4 sm:p-5 rounded-2xl transition-all duration-200 hover:-translate-x-0.5",
      isLight ? "bg-white shadow-sm border border-gray-100 hover:shadow-md" : "bg-[#151525] border border-white/10 hover:border-white/20",
    )}>
      {/* Left colour pill */}
      <div className={`shrink-0 w-1 self-stretch rounded-full bg-gradient-to-b ${cat.gradient}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", isLight ? cat.light : cat.dark)}>
            {item.category}
          </span>
          <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", isLight ? sent.lightClass : sent.darkClass)}>
            <SentIcon className="w-2.5 h-2.5" />
            {sent.label}
          </span>
        </div>
        <h3 className={cn("font-semibold text-sm leading-snug line-clamp-2 mb-1", isLight ? "text-gray-900" : "text-white")}>
          {item.headline}
        </h3>
        <p className={cn("text-xs leading-relaxed line-clamp-1", isLight ? "text-gray-500" : "text-gray-400")}>
          {item.summary}
        </p>
      </div>

      {/* Right metadata */}
      <div className={cn("shrink-0 text-right text-[11px] flex flex-col items-end gap-1 min-w-[80px]", isLight ? "text-gray-400" : "text-gray-500")}>
        <span className="font-medium">{item.source}</span>
        <span>{timeAgo}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.readTime}m</span>
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

  if (view === "carousel") {
    return (
      <div className="space-y-4">
        <div className={cn("rounded-2xl overflow-hidden", card)}>
          <Skeleton className={cn("h-52 sm:h-60", base)} />
          <div className="p-5 sm:p-6 space-y-3">
            <Skeleton className={cn("h-6 w-4/5", base)} />
            <Skeleton className={cn("h-4 w-full", base)} />
            <Skeleton className={cn("h-4 w-3/4", base)} />
            <Skeleton className={cn("h-3 w-24 mt-2", base)} />
          </div>
        </div>
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-1.5 rounded-full", base, i === 0 ? "w-5" : "w-1.5")} />
          ))}
        </div>
      </div>
    );
  }

  if (view === "grid") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={cn("rounded-2xl overflow-hidden", card)}>
            <Skeleton className={cn("h-1.5 w-full", base)} />
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex justify-between gap-2">
                <Skeleton className={cn("h-5 w-24 rounded-full", base)} />
                <Skeleton className={cn("h-5 w-20 rounded-full", base)} />
              </div>
              <Skeleton className={cn("h-4 w-full", base)} />
              <Skeleton className={cn("h-4 w-5/6", base)} />
              <Skeleton className={cn("h-3 w-full", base)} />
              <Skeleton className={cn("h-3 w-4/5", base)} />
              <div className={cn("pt-3 border-t flex justify-between", isLight ? "border-gray-100" : "border-white/5")}>
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
        <div key={i} className={cn("flex items-start gap-4 p-4 sm:p-5 rounded-2xl", card)}>
          <Skeleton className={cn("shrink-0 w-1 h-16 rounded-full", base)} />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className={cn("h-4 w-20 rounded-full", base)} />
              <Skeleton className={cn("h-4 w-16 rounded-full", base)} />
            </div>
            <Skeleton className={cn("h-4 w-full", base)} />
            <Skeleton className={cn("h-3 w-4/5", base)} />
          </div>
          <div className="shrink-0 space-y-1.5">
            <Skeleton className={cn("h-3 w-20", base)} />
            <Skeleton className={cn("h-3 w-14", base)} />
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

  const [view, setView] = useState<ViewMode>("carousel");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updatedLabel = useRelativeTime(fetchedAt);

  const fetchNews = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${BASE}api/newsfeed`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
      });
      if (!res.ok) throw new Error("Failed to load news feed");
      const data = await res.json() as { items: NewsItem[]; fetchedAt: string; stale?: boolean };
      setItems(data.items || []);
      setFetchedAt(data.fetchedAt);
    } catch (err) {
      if (!isBackground) setError("Could not load news feed. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => { fetchNews(); }, [fetchNews]);

  // Background refresh every 20 minutes
  useEffect(() => {
    const id = setInterval(() => fetchNews(true), 20 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchNews]);

  const VIEW_OPTIONS: { key: ViewMode; icon: React.ElementType; label: string }[] = [
    { key: "carousel", icon: GalleryHorizontal, label: "Carousel" },
    { key: "grid",     icon: LayoutGrid,        label: "Grid" },
    { key: "list",     icon: List,              label: "List" },
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
              AI-curated food science & R&D intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Updated pill */}
          {fetchedAt && (
            <div className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all",
              isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-white/5 border-white/10 text-gray-400",
            )}>
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : updatedLabel}
            </div>
          )}

          {/* Manual refresh */}
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

          {/* View toggle */}
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
          <AlertCircle className={cn("w-10 h-10", isLight ? "text-red-400" : "text-red-400")} />
          <p className={cn("font-medium", isLight ? "text-gray-700" : "text-gray-300")}>{error}</p>
          <button
            onClick={() => fetchNews()}
            className="text-sm text-primary hover:underline"
          >
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
            {view === "carousel" && <CarouselView items={items} isLight={isLight} />}
            {view === "grid"     && <GridView     items={items} isLight={isLight} />}
            {view === "list"     && <ListView     items={items} isLight={isLight} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
