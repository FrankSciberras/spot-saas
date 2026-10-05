import { createAdminClient } from '@/lib/supabase/server';

export interface OpenShift {
  shiftId: string;
  driverId: string;
  organizationId: string;
  startTime: string;
}

/**
 * The user's unfinished shift in ANY of their fleets, or null.
 *
 * A driver in two fleets has a driver row in each, and their phone sends
 * location for whichever row it's told about. While a shift is open, that must
 * be the shift's fleet — whatever fleet the portal happens to be showing — or
 * one fleet would receive location from time spent working for another. Used
 * to block switching fleets mid-shift and to point tracking at the right row.
 *
 * Service-role read, so only ever call it with the authenticated user's own id.
 */
export async function findOpenShift(userId: string): Promise<OpenShift | null> {
  const admin = createAdminClient();
  const { data: drivers } = await admin.from('drivers').select('id').eq('user_id', userId);
  const ids = (drivers ?? []).map((d) => d.id as string);
  if (!ids.length) return null;

  const { data: shift } = await admin
    .from('driver_shifts')
    .select('id, driver_id, organization_id, start_time')
    .in('driver_id', ids)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!shift) return null;

  return {
    shiftId: shift.id,
    driverId: shift.driver_id,
    organizationId: shift.organization_id,
    startTime: shift.start_time,
  };
}
