// Server loader for the Live Map's vehicle (GPS tracker) layer.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GPS_DEVICE_MAP_COLUMNS,
  toVehicleGpsItem,
  type GpsDeviceMapRow,
  type VehicleGpsItem,
} from './live-map-shared';

export type { VehicleGpsItem } from './live-map-shared';

/**
 * Whether the fleet has a GPS platform connected, and every tracker with a fix.
 * `supabase` is the signed-in user's client (RLS: admins/staff of the fleet);
 * `admin` only counts connections (that table is service-role only). Fails
 * soft to "not connected" before the migration is applied.
 */
export async function loadVehicleGps(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  orgId: string,
): Promise<{ connected: boolean; vehicles: VehicleGpsItem[]; hideOffShift: boolean }> {
  const { count, error } = await admin
    .from('gps_connections')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  if (error || !count) return { connected: false, vehicles: [], hideOffShift: true };

  const [{ data }, privacy] = await Promise.all([
    supabase.from('gps_devices').select(GPS_DEVICE_MAP_COLUMNS).eq('organization_id', orgId),
    admin.from('organizations').select('gps_hide_off_shift').eq('id', orgId).maybeSingle(),
  ]);
  const vehicles = ((data ?? []) as unknown as GpsDeviceMapRow[])
    .map((r) => toVehicleGpsItem(r))
    .filter((v): v is VehicleGpsItem => v !== null);
  // Privacy-first if the setting can't be read.
  const hideOffShift = privacy.error ? true : privacy.data?.gps_hide_off_shift !== false;
  return { connected: true, vehicles, hideOffShift };
}
