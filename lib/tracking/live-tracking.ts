import { createAdminClient } from '@/lib/supabase/server';
import { resolveEnabledModules } from '@/lib/modules/catalog';

export interface LiveTrackingSettings {
  /** The fleet's "Live location during shifts" setting. */
  trackOnShift: boolean;
  /** The Live Tracking module (Integrations → Modules). */
  moduleEnabled: boolean;
  /** Both on: starting a shift shares location and the app enforces it. */
  active: boolean;
}

/**
 * Whether a fleet expects its drivers to share live location during shifts.
 *
 * Read with the service-role client because drivers call this too and can't
 * read org_modules. Fails open (on) if the setting can't be read — e.g. before
 * the 20261004 migration is applied — so tracking keeps working as before.
 */
export async function getLiveTrackingSettings(organizationId: string): Promise<LiveTrackingSettings> {
  const admin = createAdminClient();
  const [orgRes, modulesRes] = await Promise.all([
    admin.from('organizations').select('track_location_on_shift').eq('id', organizationId).maybeSingle(),
    admin.from('org_modules').select('module_key, is_enabled').eq('organization_id', organizationId),
  ]);
  const trackOnShift =
    (orgRes.data as { track_location_on_shift?: boolean } | null)?.track_location_on_shift !== false;
  const moduleEnabled = resolveEnabledModules(modulesRes.data ?? []).has('tracking');
  return { trackOnShift, moduleEnabled, active: trackOnShift && moduleEnabled };
}
