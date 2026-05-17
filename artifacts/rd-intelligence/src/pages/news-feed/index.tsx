import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import {
  Rss, LayoutGrid, List, ChevronLeft, ChevronRight,
  RefreshCw, Clock, TrendingUp, TrendingDown, Minus,
  Layers, AlertCircle, ExternalLink, FlaskConical, Newspaper, BarChart3,
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

interface NewsSection {
  id: "ift" | "guardian" | "newsdata";
  label: string;
  subtitle: string;
  items: NewsItem[];
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

// ─── Shared: Card Image with gradient fallback ────────────────────────────────

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
          referrerPolicy="no-referrer"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />
      {(!item.imageUrl || imgFailed) && (
        <span className="absolute inset-0 flex items-center justify-center text-white/10 font-black text-6xl uppercase tracking-widest select-none pointer-events-none">
          {item.category.split(" ")[0]}
        </span>
      )}
    </div>
  );
}

// ─── Section Banner ───────────────────────────────────────────────────────────

interface SectionBannerProps {
  label: string;
  subtitle: string;
  icon: React.ElementType;
  gradientClass: string;
  count: number;
  isLight: boolean;
  children?: React.ReactNode;
}

function SectionBanner({ label, subtitle, icon: Icon, gradientClass, count, isLight, children }: SectionBannerProps) {
  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-3 rounded-xl mb-4",
      gradientClass,
    )}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">{label}</p>
          <p className="text-white/70 text-[11px] mt-0.5">{subtitle}</p>
        </div>
        <span className="ml-1 text-[11px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full">
          {count} articles
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Category pill (shared) ───────────────────────────────────────────────────

function CategoryPill({ category, isLight }: { category: string; isLight: boolean }) {
  const col = catColors(category);
  return (
    <span className={cn(
      "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
      isLight ? col.light : col.dark,
    )}>
      {category}
    </span>
  );
}

// ─── IFT Research Digest ──────────────────────────────────────────────────────

function IFTCard({ item, isLight }: { item: NewsItem; isLight: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const cat = catColors(item.category);
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "rounded-xl overflow-hidden border-l-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg flex flex-col",
      isLight
        ? "bg-white shadow-sm border border-gray-100 border-l-indigo-500"
        : "bg-[#0f0f1e] border border-white/8 border-l-indigo-400",
    )}>
      {/* Thumbnail (if available) */}
      {item.imageUrl && !imgFailed && (
        <div className="relative h-32 w-full flex-shrink-0 overflow-hidden">
          <img
            src={item.imageUrl}
            alt={item.imageKeyword}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      )}

      <div className="p-4 flex flex-col flex-1 gap-2">
        <div className="flex items-start justify-between gap-2">
          <CategoryPill category={item.category} isLight={isLight} />
          <span className={cn("text-[10px] shrink-0", isLight ? "text-gray-400" : "text-gray-500")}>
            {item.readTime} min read
          </span>
        </div>

        <h3 className={cn(
          "font-bold text-sm leading-snug line-clamp-3 flex-1",
          isLight ? "text-gray-900" : "text-white",
        )}>
          {item.headline}
        </h3>

        <p className={cn("text-xs leading-relaxed line-clamp-2", isLight ? "text-gray-500" : "text-gray-400")}>
          {item.summary}
        </p>

        <div className={cn(
          "flex items-center justify-between text-[11px] pt-2 border-t mt-auto",
          isLight ? "border-gray-100 text-gray-400" : "border-white/5 text-gray-500",
        )}>
          <div className="flex items-center gap-1 min-w-0">
            <span className={cn("font-medium truncate", isLight ? "text-indigo-600" : "text-indigo-400")}>{item.source}</span>
            <span className="shrink-0">· {timeAgo}</span>
          </div>
          {item.readMoreUrl && (
            <a
              href={item.readMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-indigo-500 hover:text-indigo-400 font-semibold ml-2 transition-colors"
            >
              Read <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function IFTSection({ section, isLight }: { section: NewsSection; isLight: boolean }) {
  return (
    <div>
      <SectionBanner
        label={section.label}
        subtitle={section.subtitle}
        icon={FlaskConical}
        gradientClass="bg-gradient-to-r from-indigo-700 to-violet-600"
        count={section.items.length}
        isLight={isLight}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {section.items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.04 }}
          >
            <IFTCard item={item} isLight={isLight} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Guardian Industry Spotlight ──────────────────────────────────────────────

function GuardianRow({ item, isLight }: { item: NewsItem; isLight: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const cat = catColors(item.category);
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "flex gap-0 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md",
      isLight ? "bg-white shadow-sm border border-gray-100" : "bg-[#0f0f1e] border border-white/8",
    )}>
      {/* Left image or gradient swatch */}
      <div className={cn(
        "relative flex-shrink-0 w-28 sm:w-40",
        `bg-gradient-to-br ${cat.gradient}`,
      )}>
        {item.imageUrl && !imgFailed ? (
          <img
            src={item.imageUrl}
            alt={item.imageKeyword}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgFailed(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white/15 font-black text-4xl uppercase tracking-widest select-none">
            {item.category[0]}
          </span>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 px-4 py-3 gap-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryPill category={item.category} isLight={isLight} />
          <span className={cn("text-[10px]", isLight ? "text-gray-400" : "text-gray-500")}>{timeAgo}</span>
        </div>

        <h3 className={cn(
          "font-bold text-sm sm:text-[15px] leading-snug line-clamp-2",
          isLight ? "text-gray-900" : "text-white",
        )}>
          {item.headline}
        </h3>

        <p className={cn("text-xs leading-relaxed line-clamp-2 hidden sm:block", isLight ? "text-gray-500" : "text-gray-400")}>
          {item.summary}
        </p>

        <div className={cn("flex items-center justify-between text-[11px] mt-auto", isLight ? "text-gray-400" : "text-gray-500")}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("font-semibold truncate", isLight ? "text-emerald-700" : "text-emerald-400")}>
              {item.source}
            </span>
            <span className="flex items-center gap-0.5 shrink-0">
              <Clock className="w-3 h-3" />{item.readTime}m
            </span>
          </div>
          {item.readMoreUrl && (
            <a
              href={item.readMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-emerald-600 hover:text-emerald-500 font-semibold ml-2 transition-colors"
            >
              Read more <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function GuardianSection({ section, isLight }: { section: NewsSection; isLight: boolean }) {
  return (
    <div>
      <SectionBanner
        label={section.label}
        subtitle={section.subtitle}
        icon={Newspaper}
        gradientClass="bg-gradient-to-r from-emerald-700 to-teal-600"
        count={section.items.length}
        isLight={isLight}
      />
      <div className="flex flex-col gap-3">
        {section.items.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, delay: i * 0.03 }}
          >
            <GuardianRow item={item} isLight={isLight} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Market Pulse — Fan / CSS Slider ─────────────────────────────────────────

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
      <div className="relative flex-shrink-0" style={{ height: isActive ? 200 : 170 }}>
        <CardImage item={item} className="absolute inset-0 w-full h-full" />
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

  const slots = [-3, -2, -1, 0, 1, 2, 3];

  const slotStyle = (d: number): React.CSSProperties => {
    const abs = Math.abs(d);
    const xOffsets  = [0,   200,  380,  530];
    const scales    = [1,   0.84, 0.70, 0.58];
    const opacities = [1,   0.80, 0.55, 0];
    const zIndexes  = [20,  12,   6,    1];
    const idx = Math.min(abs, 3);
    return {
      position: "absolute", left: "50%", top: "50%",
      width: "272px",
      transform: `translate(calc(-50% + ${d < 0 ? -xOffsets[idx] : xOffsets[idx]}px), -50%) scale(${scales[idx]})`,
      opacity: opacities[idx],
      zIndex: zIndexes[idx],
      transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      pointerEvents: abs > 2 ? "none" : "auto",
      height: d === 0 ? "420px" : "390px",
    };
  };

  const slotItems = slots.map(d => ({ d, item: items[(currentIdx + d + n) % n] }));

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

      <p className={cn("absolute bottom-7 right-4 text-xs z-30", isLight ? "text-slate-400" : "text-gray-500")}>
        {currentIdx + 1} / {n}
      </p>
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function GridCard({ item, isLight }: { item: NewsItem; isLight: boolean }) {
  const sent = SENTIMENT[item.sentiment] || SENTIMENT.neutral;
  const SentIcon = sent.icon;
  const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
      isLight ? "bg-white shadow-md border border-gray-100" : "bg-[#151525] border border-white/10 hover:border-white/20",
    )}>
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

// ─── List ─────────────────────────────────────────────────────────────────────

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
      <div className={`relative w-24 sm:w-32 flex-shrink-0 bg-gradient-to-br ${cat.gradient}`}>
        {item.imageUrl && !imgFailed && (
          <img
            src={item.imageUrl}
            alt={item.imageKeyword}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgFailed(true)}
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
      </div>

      <div className="flex-1 p-3 sm:p-4 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full border",
            isLight ? cat.light : cat.dark,
          )}>
            {item.category}
          </span>
          <span className={cn("flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border",
            isLight ? sent.lightClass : sent.darkClass,
          )}>
            <SentIcon className="w-2.5 h-2.5" />
          </span>
        </div>
        <h3 className={cn("font-semibold text-sm leading-snug line-clamp-2", isLight ? "text-gray-900" : "text-white")}>
          {item.headline}
        </h3>
        <p className={cn("text-xs leading-relaxed line-clamp-1 mt-0.5", isLight ? "text-gray-500" : "text-gray-400")}>
          {item.summary}
        </p>
      </div>

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

// ─── Market Pulse section (NewsData / Groq / Mock) ────────────────────────────

function MarketPulseSection({ section, isLight }: { section: NewsSection; isLight: boolean }) {
  const [view, setView] = useState<ViewMode>("slider");

  const VIEW_OPTIONS: { key: ViewMode; icon: React.ElementType; label: string }[] = [
    { key: "slider", icon: Layers,     label: "Slider" },
    { key: "grid",   icon: LayoutGrid, label: "Grid" },
    { key: "list",   icon: List,       label: "List" },
  ];

  return (
    <div>
      <SectionBanner
        label={section.label}
        subtitle={section.subtitle}
        icon={BarChart3}
        gradientClass="bg-gradient-to-r from-amber-600 to-orange-500"
        count={section.items.length}
        isLight={isLight}
      >
        {/* View toggle inside banner */}
        <div className={cn(
          "flex items-center rounded-lg p-0.5 gap-0.5",
          "bg-white/15 backdrop-blur-sm",
        )}>
          {VIEW_OPTIONS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              title={label}
              className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center transition-all",
                view === key ? "bg-white/30 text-white" : "text-white/60 hover:text-white/90",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </SectionBanner>

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {view === "slider" && <SliderView items={section.items} isLight={isLight} />}
          {view === "grid"   && <GridView   items={section.items} isLight={isLight} />}
          {view === "list"   && <ListView   items={section.items} isLight={isLight} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg", className)} />;
}

function FullPageSkeleton({ isLight }: { isLight: boolean }) {
  const base = isLight ? "bg-slate-200" : "bg-white/8";
  const card = isLight ? "bg-white border border-gray-100 shadow-sm" : "bg-[#0f0f1e] border border-white/10";
  const banner = isLight ? "bg-slate-200" : "bg-white/8";

  return (
    <div className="space-y-10">
      {[6, 5, 6].map((count, si) => (
        <div key={si}>
          <Skeleton className={cn("h-14 rounded-xl mb-4", banner)} />
          <div className={si === 2 ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
            {Array.from({ length: Math.min(count, si === 2 ? 6 : count) }).map((_, i) => (
              <div key={i} className={cn("rounded-xl overflow-hidden", card, si === 2 ? "h-48" : "flex h-20")}>
                {si !== 2 && <Skeleton className={cn("w-24 sm:w-32 h-full rounded-none", base)} />}
                {si === 2 && <Skeleton className={cn("h-full w-full", base)} />}
                {si !== 2 && (
                  <div className="flex-1 p-3 space-y-2">
                    <Skeleton className={cn("h-3 w-24 rounded-full", base)} />
                    <Skeleton className={cn("h-4 w-full", base)} />
                  </div>
                )}
              </div>
            ))}
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

  const [sections, setSections] = useState<NewsSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updatedLabel = useRelativeTime(fetchedAt);

  const fetchNews = useCallback(async (isBackground = false) => {
    if (isBackground) setRefreshing(true);
    else { setLoading(true); setError(null); }

    try {
      const res = await fetch(`${BASE}api/newsfeed`);
      if (!res.ok) throw new Error("Failed to load news feed");
      const data = await res.json() as { sections: NewsSection[]; fetchedAt: string };
      setSections(data.sections || []);
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
            <Rss className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={cn("text-xl font-bold", isLight ? "text-gray-900" : "text-white")}>News Feed</h1>
            <p className={cn("text-xs mt-0.5", isLight ? "text-gray-500" : "text-gray-400")}>
              Food science, R&D, innovation & industry intelligence
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
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <FullPageSkeleton isLight={isLight} />
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
        <div className="space-y-10">
          {sections.map(section => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {section.id === "ift"      && <IFTSection      section={section} isLight={isLight} />}
              {section.id === "guardian" && <GuardianSection section={section} isLight={isLight} />}
              {section.id === "newsdata" && <MarketPulseSection section={section} isLight={isLight} />}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
