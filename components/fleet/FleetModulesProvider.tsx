'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

const FleetModulesContext = createContext<ReadonlySet<string> | null>(null);
const EMPTY: ReadonlySet<string> = new Set();

/**
 * Carries the active fleet's ENABLED module keys from the server (the /fleet
 * layout, which already resolves them) down to client chrome — the sidebar,
 * the "+ New" menu, dashboard quick actions — so they can hide what the fleet
 * turned off. Sets don't cross the server/client boundary, so the layout passes
 * a plain string[] and we rebuild the Set here.
 */
export function FleetModulesProvider({
  enabled,
  children,
}: {
  enabled: string[];
  children: ReactNode;
}) {
  const value = useMemo(() => new Set(enabled), [enabled]);
  return (
    <FleetModulesContext.Provider value={value}>
      {children}
    </FleetModulesContext.Provider>
  );
}

/** Enabled module keys for the active fleet (empty until the provider mounts). */
export function useEnabledModules(): ReadonlySet<string> {
  return useContext(FleetModulesContext) ?? EMPTY;
}
