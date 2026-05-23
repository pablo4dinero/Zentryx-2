import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "zentryx_sounds_muted";

// Two refined chimes synthesised in real time via Web Audio.
//
//  • playMessage:     soft two-note rising sine with a 30 ms portamento glide
//                     between notes — feels like a clean modern "ping".
//  • playNotification: bell tone built from inharmonic partials at ratios
//                     1.0, 2.0, 2.76, 5.40 (the rule-of-thumb spectrum for a
//                     struck-bell timbre). Sounds noticeably warmer and more
//                     "designed" than a single oscillator.
//
// Browsers block AudioContext until the user has interacted with the page, so
// we lazily create / resume it on the first pointerdown or keydown.

function makeChannel(ctx: AudioContext) {
  // Master gain so we can apply a soft limiter and a stereo widener once,
  // instead of doing it per-note.
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  return master;
}

function playBellNote(
  ctx: AudioContext,
  master: AudioNode,
  fundamental: number,
  options: { volume?: number; durationMs?: number },
) {
  const volume = options.volume ?? 0.18;
  const dur = (options.durationMs ?? 700) / 1000;
  const partials = [
    { ratio: 1.0,  amp: 1.0,  decay: 1.0  }, // fundamental
    { ratio: 2.0,  amp: 0.55, decay: 0.85 }, // octave
    { ratio: 2.76, amp: 0.42, decay: 0.7  }, // inharmonic — bell character
    { ratio: 5.40, amp: 0.22, decay: 0.5  }, // bright overtone, decays fast
  ];
  const t = ctx.currentTime;
  for (const p of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = fundamental * p.ratio;
    osc.connect(gain);
    gain.connect(master);
    const endAt = t + dur * p.decay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume * p.amp, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    osc.start(t);
    osc.stop(endAt + 0.02);
  }
}

function playGlide(
  ctx: AudioContext,
  master: AudioNode,
  fromHz: number,
  toHz: number,
  options: { volume?: number; durationMs?: number },
) {
  const volume = options.volume ?? 0.2;
  const dur = (options.durationMs ?? 140) / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(fromHz, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + dur * 0.65);
  osc.connect(gain);
  gain.connect(master);
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<AudioNode | null>(null);
  const [muted, setMutedState] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    const ensureCtx = () => {
      try {
        if (!ctxRef.current) {
          const AC: typeof AudioContext | undefined =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AC) {
            ctxRef.current = new AC();
            masterRef.current = makeChannel(ctxRef.current);
          }
        }
        if (ctxRef.current?.state === "suspended") {
          void ctxRef.current.resume();
        }
      } catch {
        // Safari private mode or similar — silently ignore.
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

  // Two-note rising "ping" — used for new chat messages.
  const playMessage = useCallback(() => {
    if (muted || !ctxRef.current || !masterRef.current) return;
    const ctx = ctxRef.current;
    const master = masterRef.current;
    // First note: short glide from E5 → A5
    playGlide(ctx, master, 659.25, 880.00, { volume: 0.16, durationMs: 130 });
    // Second note: clean accent on C6, slightly delayed
    setTimeout(() => {
      if (ctxRef.current && masterRef.current && !muted) {
        playGlide(ctxRef.current, masterRef.current, 1046.50, 1318.51, { volume: 0.12, durationMs: 120 });
      }
    }, 90);
  }, [muted]);

  // Bell with inharmonic partials — used for bell notifications.
  const playNotification = useCallback(() => {
    if (muted || !ctxRef.current || !masterRef.current) return;
    playBellNote(ctxRef.current, masterRef.current, 880, { volume: 0.18, durationMs: 720 });
  }, [muted]);

  return { playMessage, playNotification, muted, setMuted };
}
