import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';
import {
  FLEET_SETTING_KEYS,
  USER_SETTING_KEYS,
  resolveSettings,
  type FleetSettings,
  type UserPreferences,
} from './catalog';

// =============================================================================
// Reading settings on the server. Uses the service-role client with an
// explicit organization / user filter, so it works the same from a page, an
// API route or a cron (which has no session). Every read tolerates the tables
// not existing yet (migration 20261117_org_settings not applied): you get the
// catalog defaults, exactly what a fleet that never changed anything sees.
// =============================================================================

type Row = { key: string; value: unknown };

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

let warned = false;
function warnMissing(code?: string) {
  if (warned) return;
  warned = true;
  console.warn(
    `[settings] org_settings / user_preferences not readable (${code}). Using defaults — apply supabase/migrations/20261117_org_settings.sql.`
  );
}

export interface Resolved<T> {
  values: T;
  /** Keys that have a stored (non-default) value. */
  overridden: string[];
}

async function readFleet(organizationId: string): Promise<Resolved<FleetSettings>> {
  const { data, error } = await createAdminClient()
    .from('org_settings')
    .select('key, value')
    .eq('organization_id', organizationId);
  if (error) {
    if (missingTable(error.code)) warnMissing(error.code);
    else console.error('[settings] fleet read failed:', error);
  }
  return resolveSettings<FleetSettings>(FLEET_SETTING_KEYS, (data ?? []) as Row[]);
}

async function readUser(userId: string): Promise<Resolved<UserPreferences>> {
  const { data, error } = await createAdminClient()
    .from('user_preferences')
    .select('key, value')
    .eq('user_id', userId);
  if (error) {
    if (missingTable(error.code)) warnMissing(error.code);
    else console.error('[settings] preference read failed:', error);
  }
  return resolveSettings<UserPreferences>(USER_SETTING_KEYS, (data ?? []) as Row[]);
}

/** A fleet's settings, defaults filled in. One DB read per request. */
export const getFleetSettings = cache(async (organizationId: string): Promise<FleetSettings> => (await readFleet(organizationId)).values);

/** Same as getFleetSettings, plus which keys the fleet changed (Settings page). */
export const getFleetSettingsResolved = cache(readFleet);

/** A person's preferences, defaults filled in. One DB read per request. */
export const getUserPreferences = cache(async (userId: string): Promise<UserPreferences> => (await readUser(userId)).values);

export const getUserPreferencesResolved = cache(readUser);

/**
 * Settings for many fleets in one query — for crons that loop over fleets.
 * Fleets with no stored values still get an entry (all defaults).
 */
export async function getFleetSettingsForOrgs(organizationIds: string[]): Promise<Map<string, FleetSettings>> {
  const ids = Array.from(new Set(organizationIds));
  const byOrg = new Map<string, Row[]>(ids.map((id) => [id, []]));
  if (ids.length) {
    const { data, error } = await createAdminClient()
      .from('org_settings')
      .select('organization_id, key, value')
      .in('organization_id', ids);
    if (error) {
      if (missingTable(error.code)) warnMissing(error.code);
      else console.error('[settings] bulk fleet read failed:', error);
    }
    for (const r of (data ?? []) as (Row & { organization_id: string })[]) byOrg.get(r.organization_id)?.push(r);
  }
  return new Map(ids.map((id) => [id, resolveSettings<FleetSettings>(FLEET_SETTING_KEYS, byOrg.get(id) ?? []).values]));
}
