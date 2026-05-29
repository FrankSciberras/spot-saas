import type { ReactNode } from 'react';
import { getActiveBranding, brandColorVars } from '@/lib/branding';
import { BrandingProvider } from './BrandingProvider';

/**
 * Server wrapper that applies the active fleet's branding to everything it
 * wraps:
 *   1. recolours the primary palette by setting CSS-variable overrides on a
 *      display:contents element (no layout box, so it never disturbs the
 *      existing dashboard grid), and
 *   2. exposes the logo URL to client components via BrandingProvider.
 *
 * Mounted in both the /fleet and /driver layouts, so branding cascades to a
 * fleet's drivers automatically (they share the same active organization).
 */
export default async function BrandingShell({ children }: { children: ReactNode }) {
  const branding = await getActiveBranding();
  const vars = brandColorVars(branding.brandColor);

  return (
    <BrandingProvider value={branding}>
      <div style={{ display: 'contents', ...(vars ?? {}) }}>{children}</div>
    </BrandingProvider>
  );
}
