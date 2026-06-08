import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

export function UpdatePrompt() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_, r) {
      // Check for updates every 60 seconds in the background
      if (r) setInterval(() => r.update(), 60_000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border border-primary/30 backdrop-blur-sm text-sm",
        isLight ? "bg-white/95 text-slate-900" : "bg-[#0B0B14]/95 text-foreground",
      )}
    >
      <RefreshCw className="w-4 h-4 text-primary shrink-0" />
      <span>A new version of Zentryx is available.</span>
      <button
        onClick={async () => {
          // Activate the waiting service worker, then force a full refresh so
          // the new version loads immediately (fallback if the SW's own
          // controllerchange reload doesn't fire).
          await updateServiceWorker(true);
          window.location.reload();
        }}
        className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
      >
        Update now
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        title="Dismiss — you can update later"
        aria-label="Dismiss"
        className={cn(
          "p-1 rounded-lg transition-colors shrink-0",
          isLight
            ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            : "text-muted-foreground hover:text-foreground hover:bg-white/10",
        )}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
