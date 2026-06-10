'use server';

// =============================================================================
// SETTLEMENT SETTINGS ACTIONS (per-fleet revenue split)
// =============================================================================
// A fleet ADMIN sets the company-wide default driver share % and, optionally,
// overrides it for individual drivers. Both actions re-check the admin role
// server-side via requireRole(['admin']) (which also resolves the caller's
// organization_id), then write with the service-role client scoped to that
// exact org id — so a fleet can only ever edit its own drivers' splits.
//
// Only the driver-share knob is surfaced for now; the underlying scheme
// (tips / campaigns / fee) supports more levers we can expose later.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { clampPercent, DEFAULT_SCHEME } from '@/lib/config/settlements';

type Result = { error?: string; ok?: boolean };

/** Set the fleet-wide default driver share %. Blank/invalid resets to 50. */
export async function updateDefaultDriverSharePctAction(pct: number | null): Promise<Result> {
  const user = await requireRole(['admin']);

  const value =
    pct === null || pct === undefined || Number.isNaN(pct)
      ? DEFAULT_SCHEME.driverSharePct
      : clampPercent(pct, DEFAULT_SCHEME.driverSharePct);

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({ settlement_driver_share_pct: value })
    .eq('id', user.organization_id);

  if (error) {
    console.error('updateDefaultDriverSharePctAction failed:', error);
    return { error: 'Could not save the default split.' };
  }

  revalidatePath('/fleet/settlements/settings');
  revalidatePath('/fleet/settlements');
  return { ok: true };
}

/**
 * Set (or clear, with null) a single driver's split override. NULL makes the
 * driver inherit the fleet default. The update is scoped to the caller's org so
 * an admin cannot touch another fleet's driver.
 */
export async function updateDriverSharePctAction(
  driverId: string,
  pct: number | null
): Promise<Result> {
  const user = await requireRole(['admin']);

  if (!driverId) {
    return { error: 'Missing driver.' };
  }

  const value =
    pct === null || pct === undefined || Number.isNaN(pct)
      ? null
      : clampPercent(pct, DEFAULT_SCHEME.driverSharePct);

  const admin = createAdminClient();
  const { error } = await admin
    .from('drivers')
    .update({ settlement_driver_share_pct: value })
    .eq('id', driverId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('updateDriverSharePctAction failed:', error);
    return { error: 'Could not save the driver override.' };
  }

  revalidatePath('/fleet/settlements/settings');
  revalidatePath('/fleet/settlements');
  return { ok: true };
}
