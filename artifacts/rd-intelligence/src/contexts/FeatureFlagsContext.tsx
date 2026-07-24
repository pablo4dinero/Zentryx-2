import React, { createContext, useContext } from "react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface FeatureFlagsContextType {
  efficiencyScoreEnabled: boolean;
  floorEfficiencyEnabled: boolean;
  downtimeAlertsEnabled: boolean;
  productionAnalyticsEnabled: boolean;
  isLoading: boolean;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const { isEnabled, isLoading } = useFeatureFlags();

  const value: FeatureFlagsContextType = {
    efficiencyScoreEnabled: isEnabled("efficiency_score", true),
    floorEfficiencyEnabled: isEnabled("floor_efficiency_dashboard", true),
    downtimeAlertsEnabled: isEnabled("downtime_alerts", true),
    productionAnalyticsEnabled: isEnabled("production_analytics", true),
    isLoading,
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlagsContext(): FeatureFlagsContextType {
  const context = useContext(FeatureFlagsContext);
  if (context === undefined) {
    return {
      efficiencyScoreEnabled: true,
      floorEfficiencyEnabled: true,
      downtimeAlertsEnabled: true,
      productionAnalyticsEnabled: true,
      isLoading: false,
    };
  }
  return context;
}
