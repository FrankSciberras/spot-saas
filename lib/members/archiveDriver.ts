import { createAdminClient } from '@/lib/supabase/server';

/**
 * Archive / restore a driver in one fleet.
 *
 * Archiving is the "they've left, keep their history" alternative to deleting:
 *   - the driver row STAYS (shifts, earnings, settlements, trips, safety scores
 *     all keep showing on the fleet's dashboards);
 *   - any open shift is ended and location sharing switched off;
 *   - their vehicles are freed up;
 *   - their membership in THIS fleet is removed, so they no longer resolve to
 *     the fleet anywhere in the app (getSession, RLS helpers, chat, rosters…);
 *   - if they belong to no other fleet, their login is banned, so the driver
 *     app and the web portal both stop working for them.
 *
 * Restoring reverses all of that (shifts and vehicle assignments stay as they
 * are — the fleet re-assigns a vehicle if needed).
 *
 * Every write goes through the service-role client and is scoped to
 * organizationId; callers must check the acting user is a fleet admin.
 */

/** Long enough to mean "until restored" (Supabase takes a Go duration). */
const BAN_UNTIL_RESTORED = '876000h';

export interface ArchiveResult {
  success: boolean;
  status?: number;
  error?: string;
  /** True when the driver's login was blocked (they're in no other fleet). */
  loginBlocked?: boolean;
  driverName?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

async function loadDriver(admin: Admin, driverId: string, organizationId: string) {
  const { data, error } = await admin
    .from('drivers')
    .select('id, user_id, full_name, archived_at')
    .eq('id', driverId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) {
    // Before the migration the column doesn't exist yet.
    if (/archived_at/.test(error.message)) {
      return { error: 'Archiving needs a database update first (migration 20261128_driver_archive.sql).' };
    }
    return { error: error.message };
  }
  return { driver: data as { id: string; user_id: string | null; full_name: string | null; archived_at: string | null } | null };
}

/** Does this user still belong to any fleet (membership anywhere)? */
async function hasAnyMembership(admin: Admin, userId: string): Promise<boolean> {
  const { count } = await admin
    .from('memberships')
    .select('organization_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return (count ?? 0) > 0;
}

export async function archiveDriver(params: {
  driverId: string;
  organizationId: string;
  actingUserId: string;
}): Promise<ArchiveResult> {
  const { driverId, organizationId, actingUserId } = params;
  const admin = createAdminClient();

  const loaded = await loadDriver(admin, driverId, organizationId);
  if (loaded.error) return { success: false, status: 500, error: loaded.error };
  const driver = loaded.driver;
  if (!driver) return { success: false, status: 404, error: 'Driver not found in this fleet' };
  if (driver.archived_at) return { success: false, status: 400, error: 'This driver is already archived' };
  if (driver.user_id === actingUserId) {
    return { success: false, status: 400, error: 'You cannot archive your own account' };
  }

  // Only plain drivers are archived here — an admin/staff member's access is
  // managed from Team settings, and archiving must never lock out a manager.
  if (driver.user_id) {
    const { data: membership } = await admin
      .from('memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', driver.user_id)
      .maybeSingle();
    if (membership && membership.role !== 'driver') {
      return {
        success: false,
        status: 400,
        error: 'This person is also a manager in your fleet. Remove their manager access in Team settings first.',
      };
    }
  }

  const nowIso = new Date().toISOString();

  // 1. End any open shift and stop location sharing.
  const { error: shiftError } = await admin
    .from('driver_shifts')
    .update({ end_time: nowIso, auto_closed_at: nowIso })
    .eq('driver_id', driverId)
    .eq('organization_id', organizationId)
    .is('end_time', null);
  if (shiftError) return { success: false, status: 500, error: shiftError.message };
  await admin.from('driver_positions').update({ is_tracking: false }).eq('driver_id', driverId);

  // 2. Free up their vehicles.
  await admin.from('driver_vehicle_assignments').delete().eq('driver_id', driverId).eq('organization_id', organizationId);
  await admin
    .from('vehicles')
    .update({ assigned_driver_id: null })
    .eq('organization_id', organizationId)
    .eq('assigned_driver_id', driverId);

  // 3. Mark the driver archived (and inactive, so every "active drivers" list
  //    and picker leaves them out).
  const { error: archiveError } = await admin
    .from('drivers')
    .update({
      archived_at: nowIso,
      archived_by: actingUserId,
      status: 'inactive',
      assigned_vehicle_id: null,
      updated_at: nowIso,
    })
    .eq('id', driverId)
    .eq('organization_id', organizationId);
  if (archiveError) return { success: false, status: 500, error: archiveError.message };

  // 4. Take away their access to this fleet, and their login if it was the last one.
  let loginBlocked = false;
  if (driver.user_id) {
    const { error: membershipError } = await admin
      .from('memberships')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', driver.user_id);
    if (membershipError) return { success: false, status: 500, error: membershipError.message };

    if (!(await hasAnyMembership(admin, driver.user_id))) {
      const { error: banError } = await admin.auth.admin.updateUserById(driver.user_id, {
        ban_duration: BAN_UNTIL_RESTORED,
      });
      if (banError) {
        console.error('archiveDriver: could not block login', banError);
      } else {
        loginBlocked = true;
      }
    }
  }

  return { success: true, loginBlocked, driverName: driver.full_name ?? '' };
}

export async function restoreDriver(params: {
  driverId: string;
  organizationId: string;
}): Promise<ArchiveResult> {
  const { driverId, organizationId } = params;
  const admin = createAdminClient();

  const loaded = await loadDriver(admin, driverId, organizationId);
  if (loaded.error) return { success: false, status: 500, error: loaded.error };
  const driver = loaded.driver;
  if (!driver) return { success: false, status: 404, error: 'Driver not found in this fleet' };
  if (!driver.archived_at) return { success: false, status: 400, error: 'This driver is not archived' };

  // 1. Give them their access back (as a driver).
  if (driver.user_id) {
    const { error: membershipError } = await admin
      .from('memberships')
      .upsert(
        { organization_id: organizationId, user_id: driver.user_id, role: 'driver' },
        { onConflict: 'organization_id,user_id', ignoreDuplicates: true }
      );
    if (membershipError) return { success: false, status: 500, error: membershipError.message };

    const { error: unbanError } = await admin.auth.admin.updateUserById(driver.user_id, { ban_duration: 'none' });
    if (unbanError) console.error('restoreDriver: could not lift login block', unbanError);
  }

  // 2. Back on the active list.
  const { error } = await admin
    .from('drivers')
    .update({ archived_at: null, archived_by: null, status: 'active', updated_at: new Date().toISOString() })
    .eq('id', driverId)
    .eq('organization_id', organizationId);
  if (error) return { success: false, status: 500, error: error.message };

  return { success: true, driverName: driver.full_name ?? '' };
}

/**
 * Does this user have an archived driver record in some fleet? Used to keep
 * their account (and so that fleet's history) when they leave their last
 * active fleet, and to tell them why they can't get in.
 */
export async function hasArchivedDriverRecord(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('drivers')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('archived_at', 'is', null);
  if (error) return false; // before the migration: nobody is archived
  return (count ?? 0) > 0;
}
