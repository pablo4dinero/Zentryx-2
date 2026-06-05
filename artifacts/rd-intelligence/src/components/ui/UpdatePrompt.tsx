import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";

export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_, r) {
      // Check for updates every 60 seconds in the background
      if (r) setInterval(() => r.update(), 60_000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border border-primary/30 bg-[#0B0B14]/95 backdrop-blur-sm text-sm text-foreground">
      <RefreshCw className="w-4 h-4 text-primary shrink-0" />
      <span>A new version of Zentryx is available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
      >
        Update now
      </button>
    </div>
  );
}
