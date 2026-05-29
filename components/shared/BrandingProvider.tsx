'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Branding } from '@/lib/branding';

const BrandingContext = createContext<Branding>({ logoUrl: null, brandColor: null });

/**
 * Makes the active fleet's branding available to client components (notably the
 * Sidebar logo). Seeded by the server-side BrandingShell.
 */
export function BrandingProvider({
  value,
  children,
}: {
  value: Branding;
  children: ReactNode;
}) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
