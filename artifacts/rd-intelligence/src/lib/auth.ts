import { create } from "zustand";

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
}

// Minimal state management for the token, since customFetch might not be easily configurable here,
// we ensure we store it. In a real app, customFetch in @/api-client should read this.
export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("rd_token"),
  setToken: (token) => {
    // Always clear old token first to prevent cross-user contamination
    console.log("[auth.setToken] Clearing old token");
    localStorage.removeItem("rd_token");
    if (token) {
      console.log("[auth.setToken] Setting new token, userId from JWT:", (() => {
        try {
          const parts = token.split(".");
          const payload = JSON.parse(atob(parts[1]));
          return payload.userId;
        } catch { return "ERROR_PARSING"; }
      })());
      localStorage.setItem("rd_token", token);
      const stored = localStorage.getItem("rd_token");
      console.log("[auth.setToken] Token stored successfully?", !!stored, "Matches input?", stored === token);
    }
    set({ token });
  },
  logout: () => {
    // Clear ALL app state to prevent cross-user contamination when logging in as different user
    localStorage.clear();
    sessionStorage.clear();
    set({ token: null });
    window.location.href = "/login";
  },
}));

// Global fetch interceptor:
//   1. Attaches `Authorization: Bearer <token>` to every authed request.
//   2. Reads `x-refreshed-token` from successful responses and rolls the
//      session forward (this is the 6h-idle sliding-window mechanism;
//      the server mints a fresh token on each authed call and the
//      frontend swaps it in transparently).
//   3. On 401 anywhere except the login endpoint, clears state and
//      bounces to /login. A SessionExpired body lets us show a friendly
//      message instead of an abrupt redirect.
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem("rd_token");

  if (token) {
    const headers = new Headers(init?.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    init = { ...init, headers };
  }

  const response = await originalFetch(input, init);

  // Sliding-window refresh — server hands us a new token on every
  // authed request; we swap silently so the user never sees a logout
  // unless they actually went idle past 6h or hit the 12h absolute cap.
  const refreshed = response.headers.get("x-refreshed-token");
  if (refreshed && refreshed !== token) {
    try {
      // CRITICAL: Only accept refreshed token if it's for the SAME user
      // to prevent race condition where in-flight requests from before
      // login contaminate the current user's session.
      const refreshedPayload = JSON.parse(atob(refreshed.split(".")[1]));
      const currentPayload = JSON.parse(atob(token.split(".")[1]));
      if (refreshedPayload.userId === currentPayload.userId) {
        console.log("[fetch-interceptor] Accepted x-refreshed-token for userId:", refreshedPayload.userId);
        localStorage.setItem("rd_token", refreshed);
      } else {
        console.warn("[fetch-interceptor] REJECTED x-refreshed-token: userId mismatch", {
          sent: currentPayload.userId,
          received: refreshedPayload.userId,
        });
      }
    } catch (e) {
      console.error("[fetch-interceptor] Error processing x-refreshed-token:", e);
    }
  }

  const alreadyOnLogin = window.location.pathname.startsWith("/login");
  if (response.status === 401 && !input.toString().includes("/api/auth/login") && !alreadyOnLogin) {
    // Try to read the structured reason so the login screen can show a
    // friendly notice ("Signed out due to inactivity" vs "Session
    // reached 12-hour limit"). Falls back to a generic message.
    try {
      const cloned = response.clone();
      const body = await cloned.json().catch(() => null);
      if (body?.error === "SessionExpired") {
        sessionStorage.setItem("rd_logout_reason", body.reason === "absolute"
          ? "Your session reached its 12-hour limit. Please sign in again."
          : "You were signed out due to inactivity. Please sign in again.");
      }
    } catch { /* silent */ }
    localStorage.removeItem("rd_token");
    window.location.href = "/login";
  }

  return response;
};
