import { create } from "zustand";

interface AuthState {
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
}

// Minimal state management for the token, since customFetch might not be easily configurable here,
// we ensure we store it. In a real app, customFetch in @workspace/api-client-react should read this.
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

// Setup global fetch interceptor to add Authorization header if not already present
// This is a workaround since we can't easily modify the generated customFetch in this environment
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
  
  if (response.status === 401 && !input.toString().includes('/api/auth/login')) {
    localStorage.removeItem("rd_token");
    window.location.href = "/login";
  }
  
  return response;
};
