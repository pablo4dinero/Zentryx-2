import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { PageLoader } from "@/components/ui/spinner";
import { FeatureFlagsProvider } from "@/contexts/FeatureFlagsContext";
import { PlannedOrdersProvider } from "./planned-orders-context";
import { MaterialsDemandPlanningPageContent } from "./page-content";
import type { Account } from "./lib/types";
import { BASE } from "./lib/constants";
import { authHeaders } from "./lib/helpers";

function MaterialsDemandPlanningPage() {
  const productsQuery = useQuery({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/accounts`, { headers: authHeaders() });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to load accounts");
      }
      return res.json() as Promise<Account[]>;
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
  }) as UseQueryResult<Account[], Error>;

  if (productsQuery.isLoading) return <PageLoader />;

  return <MaterialsDemandPlanningPageContent productsQuery={productsQuery} />;
}

export default function MaterialsDemandPlanning() {
  return (
    <FeatureFlagsProvider>
      <PlannedOrdersProvider>
        <MaterialsDemandPlanningPage />
      </PlannedOrdersProvider>
    </FeatureFlagsProvider>
  );
}
