// Shared helpers for new-chat-message notifications: browser/desktop
// notifications (Notification API) and the browser tab-title alert. Used by
// both AppLayout (messages that arrive while you're off the /chat page) and
// the chat page itself (messages that arrive in a room you're not viewing).
//
// Every call is wrapped in a try/catch and guarded for environments where the
// Notification API is missing (older browsers, insecure origins, SSR), so a
// caller never has to worry about it throwing.

// Captured once at module load. The app sets the tab title in index.html and
// never changes it at runtime, so this is a stable base to restore to.
const BASE_TITLE =
  (typeof document !== "undefined" && document.title) || "Zentryx";

/** Ask for desktop-notification permission once, if not already decided. */
export function ensureNotifyPermission() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* unsupported / blocked — silently ignore */
  }
}

/**
 * Show a desktop notification for a new chat message — but only when the tab
 * is in the background (hidden). When the tab is focused the in-app cues
 * (sidebar unread badge, sound, popup) already tell the user, so a system
 * popup would just be noise. The message body is intentionally generic; we
 * never leak message content into the OS notification surface.
 */
export function showChatNotification(opts: { fromName: string; onClick?: () => void }) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (typeof document !== "undefined" && !document.hidden) return;
    const n = new Notification("New message · Zentryx", {
      body: `${opts.fromName} sent you a message`,
      tag: "zentryx-chat",
      icon: `${import.meta.env.BASE_URL}favicon.ico`,
    });
    n.onclick = () => {
      try { window.focus(); } catch {}
      opts.onClick?.();
      n.close();
    };
  } catch {
    /* unsupported / blocked — silently ignore */
  }
}

/**
 * Reflect the unread-message count in the browser tab title, e.g.
 * "(2) Zentryx:New Messages". Passing 0 (or less) restores the original title.
 */
export function setChatTabTitle(count: number) {
  try {
    if (typeof document === "undefined") return;
    document.title = count > 0 ? `(${count}) Zentryx:New Messages` : BASE_TITLE;
  } catch {
    /* ignore */
  }
}
