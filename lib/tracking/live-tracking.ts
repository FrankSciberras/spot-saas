import { createAdminClient } from '@/lib/supabase/server';
import { resolveEnabledModules } from '@/lib/modules/catalog';

export interface LiveTrackingSettings {
  /** The fleet's "Live location during shifts" setting. */
  trackOnShift: boolean;
  /** The Live Tracking module (Integrations → Modules). */
  moduleEnabled: boolean;
  /** Both on: starting a shift shares location and the app enforces it. */
  active: boolean;
  /** The fleet rule as set: shifts only from the app, with location working. */
  requireRule: boolean;
  /** The rule in force (it needs live location on, too). */
  requireForShift: boolean;
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
    // '*' so a column a migration hasn't added yet can't fail the whole read.
    admin.from('organizations').select('*').eq('id', organizationId).maybeSingle(),
    admin.from('org_modules').select('module_key, is_enabled').eq('organization_id', organizationId),
  ]);
  const org = orgRes.data as { track_location_on_shift?: boolean; require_location_for_shift?: boolean } | null;
  const trackOnShift = org?.track_location_on_shift !== false;
  const moduleEnabled = resolveEnabledModules(modulesRes.data ?? []).has('tracking');
  const active = trackOnShift && moduleEnabled;
  const requireRule = org?.require_location_for_shift === true;
  return { trackOnShift, moduleEnabled, active, requireRule, requireForShift: active && requireRule };
}
