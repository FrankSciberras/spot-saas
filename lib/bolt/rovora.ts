// =============================================================================
// The fleet's own Rovora drivers & vehicles, in the shape the Bolt matcher uses
// =============================================================================
// Shared by the sync (which links Bolt records to them) and the fleet import
// (which re-checks for duplicates just before creating anything).
//
// SERVER ONLY — service-role reads, always scoped to one organization_id.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RovoraDriverRef, RovoraVehicleRef } from './mapping';

/** The fleet's drivers, with their login email, for matching to Bolt's. */
export async function loadRovoraDrivers(admin: SupabaseClient, organizationId: string): Promise<RovoraDriverRef[]> {
  const { data: drivers } = await admin
    .from('drivers')
    .select('id, full_name, phone, user_id')
    .eq('organization_id', organizationId)
    .range(0, 4999);

  const rows = (drivers ?? []) as { id: string; full_name: string | null; phone: string | null; user_id: string | null }[];
  const userIds = rows.map((d) => d.user_id).filter((id): id is string => Boolean(id));

  const emailById = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data: users } = await admin.from('users').select('id, email').in('id', userIds.slice(i, i + 200));
    for (const u of (users ?? []) as { id: string; email: string | null }[]) {
      if (u.email) emailById.set(u.id, u.email);
    }
  }

  return rows.map((d) => ({
    id: d.id,
    full_name: d.full_name,
    phone: d.phone,
    email: d.user_id ? emailById.get(d.user_id) ?? null : null,
  }));
}

export async function loadRovoraVehicles(admin: SupabaseClient, organizationId: string): Promise<RovoraVehicleRef[]> {
  const { data } = await admin
    .from('vehicles')
    .select('id, registration_number')
    .eq('organization_id', organizationId)
    .range(0, 4999);
  return (data ?? []) as RovoraVehicleRef[];
}
