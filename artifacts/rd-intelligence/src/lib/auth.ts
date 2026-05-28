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
    if (token) {
      localStorage.setItem("rd_token", token);
    } else {
      localStorage.removeItem("rd_token");
    }
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("rd_token");
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
    localStorage.setItem("rd_token", refreshed);
  }

  if (response.status === 401 && !input.toString().includes("/api/auth/login")) {
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
