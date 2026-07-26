import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatBgStyle = "neural" | "rotating-box" | "plain";

export interface ChatBgPrefs {
  style: ChatBgStyle;
  color: string;
}

const LS_KEY = "zentryx_chat_bg_v1";
const DEFAULT_PREFS: ChatBgPrefs = { style: "rotating-box", color: "#0f0e17" };

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatBg() {
  const [prefs, setPrefs] = useState<ChatBgPrefs>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<ChatBgPrefs>;
        const validStyle = (["neural", "rotating-box", "plain"] as ChatBgStyle[]).includes(p.style as ChatBgStyle);
        return { style: validStyle ? (p.style as ChatBgStyle) : DEFAULT_PREFS.style, color: p.color ?? DEFAULT_PREFS.color };
      }
    } catch { /* ignore */ }
    return DEFAULT_PREFS;
  });

  const update = (patch: Partial<ChatBgPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  return {
    bgPrefs: prefs,
    setBgStyle: (style: ChatBgStyle) => update({ style }),
    setBgColor:  (color: string)      => update({ color }),
  };
}

// ─── Option 1: Neural Network ─────────────────────────────────────────────────

export function NeuralBackground({ isLight }: { isLight: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const COUNT = 35;
    const DIST  = 120;
    const nodes = Array.from({ length: COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.8 + 0.72,
      phase: Math.random() * Math.PI * 2,
    }));

    let raf: number;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const nodeFill = isLight ? "rgba(99, 102, 241," : "rgba(167, 139, 250,";
      const lineFill = isLight ? "rgba(139, 92, 246," : "rgba(56, 189, 248,";

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        a.x += a.vx; a.y += a.vy; a.phase += 0.015;
        if (a.x < 0) a.x = canvas.width;
        if (a.x > canvas.width) a.x = 0;
        if (a.y < 0) a.y = canvas.height;
        if (a.y > canvas.height) a.y = 0;

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < DIST) {
            const alpha = (1 - d / DIST) * (isLight ? 0.18 : 0.15);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `${lineFill}${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }

        const pulse = a.r + Math.sin(a.phase) * 0.5;
        ctx.beginPath();
        ctx.arc(a.x, a.y, pulse, 0, Math.PI * 2);
        ctx.fillStyle = `${nodeFill}${isLight ? 0.48 : 0.42})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };

    tick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [isLight]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: isLight ? 0.42 : 0.27 }}
    />
  );
}

// ─── Option 2: Rotating Box ───────────────────────────────────────────────────

export function RotatingBoxBackground({ isLight }: { isLight: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
      {/* Outermost box — largest, slowest, violet */}
      <motion.div
        className="absolute"
        style={{
          width: "150%", height: "150%",
          border: isLight ? "1px solid rgba(139,92,246,0.14)" : "1px solid rgba(139,92,246,0.28)",
          borderRadius: "32px",
          boxShadow: isLight ? "none" : "inset 0 0 80px rgba(139,92,246,0.04)",
        }}
        animate={{ rotate: [8, 368] }}
        transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
      />
      {/* Middle box — medium, counter-rotates, cyan */}
      <motion.div
        className="absolute"
        style={{
          width: "105%", height: "105%",
          border: isLight ? "1px solid rgba(6,182,212,0.11)" : "1px solid rgba(6,182,212,0.24)",
          borderRadius: "24px",
          boxShadow: isLight ? "none" : "inset 0 0 50px rgba(6,182,212,0.03)",
        }}
        animate={{ rotate: [-10, -370] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner box — smallest, slower counter-clockwise, violet-indigo */}
      <motion.div
        className="absolute"
        style={{
          width: "68%", height: "68%",
          border: isLight ? "1px solid rgba(99,102,241,0.10)" : "1px solid rgba(167,139,250,0.20)",
          borderRadius: "18px",
        }}
        animate={{ rotate: [18, 378] }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

// ─── Chat wave + fade overlay (shared by neural & rotating-box) ───────────────

export function ChatWaveOverlay({ isLight }: { isLight: boolean }) {
  return (
    <>
      <svg
        aria-hidden
        className="absolute inset-x-0 bottom-0 w-full h-48 opacity-30"
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chatWaveA" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={isLight ? "#a78bfa" : "#7c4dff"} stopOpacity="0.18" />
            <stop offset="100%" stopColor={isLight ? "#22d3ee" : "#38bdf8"} stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="chatWaveB" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={isLight ? "#f0abfc" : "#ec4899"} stopOpacity="0.14" />
            <stop offset="100%" stopColor={isLight ? "#818cf8" : "#7c4dff"} stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <path className="chat-wave chat-wave-a" fill="url(#chatWaveA)"
          d="M0,160 C240,200 480,80 720,128 C960,176 1200,80 1440,128 L1440,240 L0,240 Z" />
        <path className="chat-wave chat-wave-b" fill="url(#chatWaveB)"
          d="M0,180 C240,140 480,220 720,168 C960,120 1200,200 1440,160 L1440,240 L0,240 Z" />
      </svg>
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t",
          isLight ? "from-white/80 to-transparent" : "from-background/70 to-transparent",
        )}
      />
    </>
  );
}

// ─── ChatBgPicker ─────────────────────────────────────────────────────────────

const OPTIONS: { key: ChatBgStyle; label: string; desc: string }[] = [
  { key: "neural",        label: "Neural Network", desc: "Animated nodes & connections" },
  { key: "rotating-box",  label: "Rotating Box",   desc: "Counter-rotating gradient frames" },
  { key: "plain",         label: "Plain Colour",   desc: "Custom solid background colour" },
];

export function ChatBgPicker({ prefs, setBgStyle, setBgColor, isLight }: {
  prefs: ChatBgPrefs;
  setBgStyle: (s: ChatBgStyle) => void;
  setBgColor: (c: string) => void;
  isLight: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Change chat background"
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
          open
            ? "bg-primary/20 text-primary"
            : isLight
              ? "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              : "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10",
        )}
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className={cn(
            "absolute right-0 top-11 z-50 w-68 rounded-2xl border shadow-xl p-3 space-y-1",
            isLight ? "bg-white border-slate-200" : "bg-card border-white/10",
          )} style={{ minWidth: "260px" }}>
            <p className={cn(
              "text-[10px] font-semibold uppercase tracking-wider mb-2.5 px-1",
              isLight ? "text-slate-400" : "text-muted-foreground",
            )}>
              Chat Background
            </p>

            {OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setBgStyle(opt.key)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                  prefs.style === opt.key
                    ? isLight ? "bg-primary/10 text-primary" : "bg-primary/15 text-primary"
                    : isLight ? "hover:bg-slate-50 text-slate-700" : "hover:bg-white/5 text-foreground",
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  prefs.style === opt.key
                    ? "border-primary"
                    : isLight ? "border-slate-300" : "border-white/20",
                )}>
                  {prefs.style === opt.key && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-none mb-0.5">{opt.label}</p>
                  <p className={cn("text-[11px]", isLight ? "text-slate-400" : "text-muted-foreground")}>
                    {opt.desc}
                  </p>
                </div>
                {opt.key === "rotating-box" && prefs.style !== opt.key && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary shrink-0 leading-none">
                    Default
                  </span>
                )}
              </button>
            ))}

            {/* Colour picker — only shown when "plain" is active */}
            {prefs.style === "plain" && (
              <div className={cn(
                "mt-2 pt-3 border-t flex items-center gap-3 px-3",
                isLight ? "border-slate-100" : "border-white/5",
              )}>
                <span className={cn("text-xs flex-1", isLight ? "text-slate-600" : "text-muted-foreground")}>
                  Pick colour
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[11px] font-mono", isLight ? "text-slate-500" : "text-muted-foreground")}>
                    {prefs.color}
                  </span>
                  <input
                    type="color"
                    value={prefs.color}
                    onChange={e => setBgColor(e.target.value)}
                    className="w-9 h-8 rounded-lg cursor-pointer p-0.5 border"
                    style={{ borderColor: isLight ? "#e2e8f0" : "rgba(255,255,255,0.1)" }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
