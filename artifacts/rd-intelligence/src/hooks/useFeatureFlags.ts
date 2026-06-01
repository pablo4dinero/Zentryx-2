import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

export interface FeatureFlag {
  id: number;
  featureName: string;
  displayName: string;
  description: string;
  enabled: boolean;
  category: string;
  updatedAt: string;
}

async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  try {
    const response = await fetch(`${BASE}api/feature-flags`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return {};

    const flags = await response.json();
    return flags || {};
  } catch (error) {
    console.error("[useFeatureFlags] Failed to fetch flags:", error);
    return {};
  }
}

export function useFeatureFlags() {
  const { data = {}, isLoading, error, refetch } = useQuery({
    queryKey: ["featureFlags"],
    queryFn: fetchFeatureFlags,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 10, // 10 min to reduce server load
    retry: 1,
  });

  return {
    flags: data,
    isLoading,
    error,
    refetch,
    isEnabled: (featureName: string) => {
      if (!data || typeof data !== "object") return false;
      return data[featureName] === true;
    },
  };
}
