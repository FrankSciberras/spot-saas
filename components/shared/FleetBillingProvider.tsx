'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/** The slice of fleet billing the dashboard chrome needs (the trial banner). */
export interface TrialInfo {
  onTrial: boolean;
  trialExpired: boolean;
  trialDaysLeft: number;
}

const FleetBillingContext = createContext<TrialInfo | null>(null);

/**
 * Carries the active fleet's trial status from the server (the /fleet layout,
 * which already resolves billing) down to client chrome like the trial banner —
 * so DashboardLayout never has to import the server-only billing module.
 */
export function FleetBillingProvider({
  value,
  children,
}: {
  value: TrialInfo | null;
  children: ReactNode;
}) {
  return <FleetBillingContext.Provider value={value}>{children}</FleetBillingContext.Provider>;
}

export function useTrialInfo(): TrialInfo | null {
  return useContext(FleetBillingContext);
}
