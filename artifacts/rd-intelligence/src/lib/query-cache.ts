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
    // Invalidate all queries (marks them as stale, forces refetch)
    // This is safer than clear() which might not exist
    globalQueryClient.invalidateQueries();
    // Also remove all query data to ensure old cached data is gone
    globalQueryClient.removeQueries();
  }
}
