import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL;

export interface FlagDetail {
  enabled: boolean;
  allowedRoles: string[] | null;
}

async function fetchFeatureFlags(): Promise<Record<string, FlagDetail>> {
  try {
    const response = await fetch(`${BASE}api/feature-flags`, {
      headers: { "Content-Type": "application/json" },
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
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
    retry: 1,
  });

  return {
    flags: data as Record<string, FlagDetail>,
    isLoading,
    error,
    refetch,
    isEnabled: (featureName: string, fallback = false) => {
      const flag = (data as Record<string, FlagDetail>)[featureName];
      if (flag === undefined) return fallback;
      return flag.enabled === true;
    },
    canAccess: (featureName: string, userRole: string | null | undefined) => {
      const flag = (data as Record<string, FlagDetail>)[featureName];
      // If flag not yet in DB, default to visible
      if (flag === undefined) return true;
      if (!flag.enabled) return false;
      // Admin always bypasses role restrictions
      if (userRole === "admin") return true;
      if (!flag.allowedRoles || flag.allowedRoles.length === 0) return true;
      return flag.allowedRoles.includes(userRole ?? "");
    },
  };
}
