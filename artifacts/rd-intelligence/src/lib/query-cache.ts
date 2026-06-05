import { QueryClient } from "@tanstack/react-query";

// Global query client instance (initialized in App.tsx)
let globalQueryClient: QueryClient | null = null;

export function setQueryClient(client: QueryClient) {
  globalQueryClient = client;
}

export function getQueryClient(): QueryClient | null {
  return globalQueryClient;
}

export function clearQueryCache() {
  if (globalQueryClient) {
    globalQueryClient.clear();
  }
}
