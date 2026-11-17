'use server';

// =============================================================================
// SAVE SETTINGS — fleet settings (admins) and personal preferences (anyone).
// =============================================================================
// Every value is checked against lib/settings/catalog.ts before it's written.
// Saving a setting's default deletes the stored row instead, so the tables only
// ever hold real overrides and "Reset to default" is the same as saving the
// default. Writes use the service-role client, scoped to the caller's own fleet
// / own user id (the tables have no browser write policies).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { SETTINGS, isSettingKey } from '@/lib/settings/catalog';
import { coerceSettingValue, settingValueError, type SettingScope, type StoredValue } from '@/lib/settings/types';
import { getFleetSettingsResolved, getUserPreferencesResolved } from '@/lib/settings/server';

type Patch = Record<string, unknown>;
export type SaveSettingsResult = { error?: string; values?: Record<string, StoredValue>; overridden?: string[] };

const MIGRATION_HINT = 'Settings need a database update first (migration 20261117_org_settings).';
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

/** Validates a patch for one scope; returns rows to write and keys to clear. */
function plan(scope: SettingScope, patch: Patch): { error: string } | { upserts: [string, StoredValue][]; clears: string[] } {
  const entries = Object.entries(patch ?? {});
  if (!entries.length) return { error: 'Nothing to save.' };
  if (entries.length > 50) return { error: 'Too many settings in one save.' };
  const upserts: [string, StoredValue][] = [];
  const clears: string[] = [];
  for (const [key, raw] of entries) {
    if (!isSettingKey(key)) return { error: `Unknown setting “${key}”.` };
    const def = SETTINGS[key];
    if (def.scope !== scope) return { error: `“${def.label}” can’t be changed here.` };
    // null = reset to default.
    if (raw === null) { clears.push(key); continue; }
    const value = coerceSettingValue(def, raw);
    if (value === undefined) return { error: settingValueError(def) };
    if (value === def.default) clears.push(key);
    else upserts.push([key, value]);
  }
  return { upserts, clears };
}

/** Admin-only: change settings for the caller's active fleet. */
export async function saveFleetSettingsAction(patch: Patch): Promise<SaveSettingsResult> {
  const session = await getSession();
  if (!session) return { error: 'Please sign in again.' };
  if (session.role !== 'admin') return { error: 'Only fleet admins can change fleet settings.' };

  const p = plan('fleet', patch);
  if ('error' in p) return { error: p.error };

  const db = createAdminClient();
  const org = session.organization_id;
  const now = new Date().toISOString();
  if (p.upserts.length) {
    const { error } = await db.from('org_settings').upsert(
      p.upserts.map(([key, value]) => ({ organization_id: org, key, value, updated_by: session.id, updated_at: now })),
      { onConflict: 'organization_id,key' }
    );
    if (error) {
      console.error('saveFleetSettingsAction upsert failed:', error);
      return { error: missingTable(error.code) ? MIGRATION_HINT : 'Could not save the setting. Please try again.' };
    }
  }
  if (p.clears.length) {
    const { error } = await db.from('org_settings').delete().eq('organization_id', org).in('key', p.clears);
    if (error) {
      console.error('saveFleetSettingsAction delete failed:', error);
      return { error: missingTable(error.code) ? MIGRATION_HINT : 'Could not save the setting. Please try again.' };
    }
  }

  // Pages across /fleet read these through the layout's provider.
  revalidatePath('/fleet', 'layout');
  revalidatePath('/driver', 'layout');
  const fresh = await getFleetSettingsResolved(org);
  return { values: fresh.values as unknown as Record<string, StoredValue>, overridden: fresh.overridden };
}

/** Any signed-in person: change their own preferences. */
export async function savePreferencesAction(patch: Patch): Promise<SaveSettingsResult> {
  const session = await getSession();
  if (!session) return { error: 'Please sign in again.' };

  const p = plan('user', patch);
  if ('error' in p) return { error: p.error };

  const db = createAdminClient();
  const now = new Date().toISOString();
  if (p.upserts.length) {
    const { error } = await db.from('user_preferences').upsert(
      p.upserts.map(([key, value]) => ({ user_id: session.id, key, value, updated_at: now })),
      { onConflict: 'user_id,key' }
    );
    if (error) {
      console.error('savePreferencesAction upsert failed:', error);
      return { error: missingTable(error.code) ? MIGRATION_HINT : 'Could not save your preference. Please try again.' };
    }
  }
  if (p.clears.length) {
    const { error } = await db.from('user_preferences').delete().eq('user_id', session.id).in('key', p.clears);
    if (error) {
      console.error('savePreferencesAction delete failed:', error);
      return { error: missingTable(error.code) ? MIGRATION_HINT : 'Could not save your preference. Please try again.' };
    }
  }

  revalidatePath('/fleet', 'layout');
  revalidatePath('/driver', 'layout');
  const fresh = await getUserPreferencesResolved(session.id);
  return { values: fresh.values as unknown as Record<string, StoredValue>, overridden: fresh.overridden };
}
