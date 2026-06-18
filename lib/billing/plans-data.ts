// =============================================================================
// BILLING — PLAN CATALOGUE LOADER (server only)
// =============================================================================
// Loads the DB-backed package catalogue (the `plans` table) and maps rows to the
// client-safe PlanDef shape used everywhere. Imports the Supabase server client
// (depends on next/headers) so it must never be pulled into a client bundle —
// pass the resulting PlanDef[] down to client components as props.
//
// If the DB read fails for any reason we fall back to FALLBACK_PLANS so the
// marketing page, onboarding, billing gate and metrics still work.
// =============================================================================

import { cache } from 'react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { PlanRow } from '@/lib/types/database';
import { type PlanDef, FALLBACK_PLANS } from './plans';

function mapRow(r: PlanRow): PlanDef {
  return {
    id: r.key,
    name: r.name,
    blurb: r.blurb,
    priceLabel: r.price_label,
    priceUnit: r.price_unit,
    priceAmount: Number(r.price_amount) || 0,
    billingNote: r.billing_note,
    capLabel: r.cap_label,
    maxDrivers: r.max_drivers,
    maxVehicles: r.max_vehicles,
    includedVehicles: r.included_vehicles ?? null,
    perVehiclePrice: r.per_vehicle_price != null ? Number(r.per_vehicle_price) : null,
    features: r.features ?? [],
    color: r.color,
    ctaLabel: r.cta_label,
    ctaHref: r.cta_href,
    isCustom: r.is_custom,
    isPopular: r.is_popular,
    sortOrder: r.sort_order,
    stripePriceId: r.stripe_price_id ?? null,
    stripeProductId: r.stripe_product_id ?? null,
  };
}

/**
 * Published packages, ordered for display — used by marketing, onboarding, the
 * in-app billing screen and the limit-enforcement layer. Cached per request.
 */
export const getPlans = cache(async (): Promise<PlanDef[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    const rows = (data as PlanRow[] | null) ?? [];
    if (rows.length === 0) return FALLBACK_PLANS;
    return rows.map(mapRow);
  } catch (err) {
    console.error('getPlans failed, using fallback catalogue:', err);
    return FALLBACK_PLANS;
  }
});

/**
 * ALL packages incl. drafts, for the platform-admin Packages editor. Uses the
 * service-role client so drafts are visible regardless of RLS.
 */
export const getAllPlans = cache(async (): Promise<PlanRow[]> => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('plans')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('getAllPlans failed:', error);
    return [];
  }
  return (data as PlanRow[] | null) ?? [];
});
