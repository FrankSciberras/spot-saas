// =============================================================================
// FLEET BRANDING (white-label logo + accent colour)
// =============================================================================
// Branding lives on the organization, so it is resolved from the request's
// ACTIVE org and cascades to that fleet's drivers automatically. The read is
// React-cached so the layout wrapper, the sidebar provider and any other caller
// in one request share a single round-trip.
// =============================================================================

import { cache } from 'react';
import type { CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgId } from '@/lib/auth/org-context';

export interface Branding {
  /** Public URL of the org's logo, or null to use the default Rovora logo. */
  logoUrl: string | null;
  /** Hex accent colour like '#1a8f5a', or null to use the default palette. */
  brandColor: string | null;
}

export const EMPTY_BRANDING: Branding = { logoUrl: null, brandColor: null };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

/**
 * Resolve branding for the current request's active organization. Returns empty
 * branding when unauthenticated or when the fleet hasn't customised anything.
 */
export const getActiveBranding = cache(async (): Promise<Branding> => {
  const orgId = await getActiveOrgId();
  if (!orgId) return EMPTY_BRANDING;

  const supabase = await createClient();
  const { data } = await supabase
    .from('organizations')
    .select('logo_url, brand_color')
    .eq('id', orgId)
    .single();

  return {
    logoUrl: (data?.logo_url as string | null) ?? null,
    brandColor: (data?.brand_color as string | null) ?? null,
  };
});

// -----------------------------------------------------------------------------
// Colour helpers — derive the primary palette tokens from a single brand hex.
// -----------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

/** Mix a colour toward white (amount > 0) or black (amount < 0), -1..1. */
function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

/**
 * Build the CSS-variable overrides that recolour the dashboard's primary
 * palette from a single brand colour. Returned as an inline-style object to set
 * on a wrapping element (we use display:contents so it adds no layout box).
 * Returns null for an invalid/empty colour so callers can skip the override.
 */
export function brandColorVars(brandColor: string | null): CSSProperties | null {
  if (!brandColor || !isValidHex(brandColor)) return null;

  const { r, g, b } = hexToRgb(brandColor);
  const rgb = `${r}, ${g}, ${b}`;
  // The cast lets us assign CSS custom properties through a typed style object.
  return {
    // Legacy primary palette (driver app + non-fleet surfaces).
    '--color-primary': brandColor,
    '--color-primary-dark': shade(brandColor, -0.18),
    '--color-primary-light': shade(brandColor, 0.28),
    '--color-primary-rgb': rgb,
    // Fleet accent palette. fleet-theme.css reads these via var() fallbacks, so
    // the whole dashboard accent (buttons, links, active nav, toggles) recolours.
    '--brand-accent': brandColor,
    '--brand-accent-rgb': rgb,
    '--brand-accent-soft': `rgba(${rgb}, 0.14)`,
    '--brand-accent-line': `rgba(${rgb}, 0.32)`,
  } as CSSProperties;
}
