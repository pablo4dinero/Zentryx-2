import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "zentryx_sounds_muted";

// Play a short synthesised chime via Web Audio. No audio files to ship, no
// extra network requests, and the same code runs in the browser tab and in
// the installed PWA window. Browsers block AudioContext until the user has
// interacted with the page, so we lazily unlock it on the first click /
// keydown event and resume it on subsequent gestures.
function playChime(
  ctx: AudioContext,
  notes: { freq: number; durationMs: number }[],
  options?: { type?: OscillatorType; volume?: number; gap?: number },
) {
  const type = options?.type ?? "sine";
  const volume = options?.volume ?? 0.18;
  const gap = options?.gap ?? 0;
  let t = ctx.currentTime;
  for (const note of notes) {
    const dur = note.durationMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = note.freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
    t += dur + gap / 1000;
  }
}

export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMutedState] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
  });

  // Lazily create / resume the AudioContext on the first user gesture so the
  // browser doesn't refuse to play. We keep listeners attached because tabs
  // suspended in the background can re-suspend the context.
  useEffect(() => {
    const ensureCtx = () => {
      try {
        if (!ctxRef.current) {
          const AC: typeof AudioContext | undefined =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AC) ctxRef.current = new AC();
        }
        if (ctxRef.current?.state === "suspended") {
          void ctxRef.current.resume();
        }
      } catch {
        // Some browsers (Safari private mode) can throw here — ignore.
      }
    };
    window.addEventListener("pointerdown", ensureCtx, { passive: true });
    window.addEventListener("keydown", ensureCtx, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", ensureCtx);
      window.removeEventListener("keydown", ensureCtx);
    };
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch {}
  }, []);

  // Two-note rising chime — softer, used for chat messages.
  const playMessage = useCallback(() => {
    if (muted || !ctxRef.current) return;
    playChime(ctxRef.current, [
      { freq: 659.25, durationMs: 110 }, // E5
      { freq: 880.00, durationMs: 180 }, // A5
    ], { type: "sine", volume: 0.18, gap: 10 });
  }, [muted]);

  // Single bell-like tone with a slow decay — used for bell notifications.
  const playNotification = useCallback(() => {
    if (muted || !ctxRef.current) return;
    playChime(ctxRef.current, [
      { freq: 987.77, durationMs: 260 }, // B5
    ], { type: "triangle", volume: 0.16 });
  }, [muted]);

  return { playMessage, playNotification, muted, setMuted };
}
