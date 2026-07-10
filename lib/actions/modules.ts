'use server';

// =============================================================================
// FLEET MODULE ACTIONS (per-fleet feature on/off — the "apps" / plugins system)
// =============================================================================
// A fleet ADMIN switches product modules on or off for their workspace. The
// master list lives in lib/modules/catalog.ts; we persist only OVERRIDES to the
// org_modules table (no row = the catalog default). Every action re-checks the
// admin role server-side and writes with the service-role client scoped to the
// caller's organization_id.
//
// Turning a module off hides its sidebar items (FleetSidebar) and blocks its
// routes (requireModule). Nothing is deleted — flip it back on and the feature
// and all its data return exactly as before.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { FLEET_MODULES } from '@/lib/modules/catalog';

type Result = { error?: string; ok?: boolean };

/** Switch a module on or off for the caller's active fleet. */
export async function setModuleEnabledAction(
  moduleKey: string,
  enabled: boolean,
): Promise<Result> {
  const user = await requireRole(['admin']);

  const mod = FLEET_MODULES.find((m) => m.key === moduleKey);
  if (!mod) return { error: 'Unknown module.' };
  if (mod.status !== 'available') {
    return { error: 'This module isn’t available yet.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.from('org_modules').upsert(
    {
      organization_id: user.organization_id,
      module_key: moduleKey,
      is_enabled: enabled,
    },
    { onConflict: 'organization_id,module_key' },
  );

  if (error) {
    console.error('setModuleEnabledAction failed:', error);
    return { error: 'Could not update the module. Please try again.' };
  }

  // The sidebar, quick actions and route guards all read the enabled set from
  // the fleet layout, so revalidate the whole /fleet subtree.
  revalidatePath('/fleet', 'layout');
  return { ok: true };
}
