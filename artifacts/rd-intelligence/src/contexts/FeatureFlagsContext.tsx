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
  const { flags = {}, isLoading } = useFeatureFlags() || { flags: {}, isLoading: false };

  const value: FeatureFlagsContextType = {
    efficiencyScoreEnabled: flags?.efficiency_score ?? true,
    floorEfficiencyEnabled: flags?.floor_efficiency_dashboard ?? true,
    downtimeAlertsEnabled: flags?.downtime_alerts ?? true,
    productionAnalyticsEnabled: flags?.production_analytics ?? true,
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
    // Return defaults if context not provided
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
