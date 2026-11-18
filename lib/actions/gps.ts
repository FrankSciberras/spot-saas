'use server';

// =============================================================================
// GPS TRACKER ACTIONS (fleet admin only)
// =============================================================================
// Connect / sync / disconnect a fleet's GPS platform account, and choose which
// vehicle each tracker sits in. Every action re-checks the ADMIN role for the
// caller's ACTIVE fleet and then works with the service-role client scoped to
// that organization_id — gps_connections has no client-side access at all
// (see 20261117_gps_trackers.sql). Credentials are encrypted before they are
// stored and are never sent back to the browser.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { openSecret } from '@/lib/crypto/secret-box';
import { getGpsProvider } from '@/lib/gps/providers';
import {
  describeGpsError,
  loadGpsConnections,
  openCredentials,
  sealCredentials,
  syncGpsConnection,
  type GpsConnection,
} from '@/lib/gps/sync';
import { GpsProviderError, type GpsCredentials } from '@/lib/gps/types';
import { hostedGpsConfig, isValidImei } from '@/lib/gps/hosted/config';
import {
  addFleetDevice,
  createFleetAccount,
  deleteFleetAccount,
  deleteFleetDevice,
  renameFleetDevice,
} from '@/lib/gps/hosted/traccar-admin';
import { syncGpsTrackerBillingSafe } from '@/lib/billing/gps-billing';

type Result = { ok?: boolean; error?: string; message?: string };

const isMissingTable = (code?: string) => code === '42P01' || code === 'PGRST205';

async function setGpsModule(admin: ReturnType<typeof createAdminClient>, orgId: string, on: boolean) {
  await admin
    .from('org_modules')
    .upsert({ organization_id: orgId, module_key: 'gps', is_enabled: on }, { onConflict: 'organization_id,module_key' });
}

/**
 * Checks the credentials against the GPS platform, stores them (encrypted),
 * and imports every tracker. `connectionId` = reconnect an existing account.
 */
export async function connectGpsAction(input: {
  provider: string;
  values: Record<string, string>;
  connectionId?: string | null;
}): Promise<{ ok: true; devices: number; linked: number; warning?: string } | { ok: false; error: string }> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;

  const adapter = getGpsProvider(input.provider);
  if (!adapter) return { ok: false, error: 'Pick a GPS platform first.' };

  // Only keep the fields this provider asks for; trim and size-check them.
  const credentials: GpsCredentials = {};
  for (const f of adapter.fields) {
    const raw = input.values?.[f.key];
    const v = typeof raw === 'string' ? (f.secret ? raw.trim() : raw.trim()) : '';
    if (v.length > 2000) return { ok: false, error: `${f.label} is too long.` };
    if (v) credentials[f.key] = v;
    else if (f.options && f.defaultValue) credentials[f.key] = f.defaultValue;
  }
  const missing = adapter.fields.find((f) => !f.optional && !f.options && !credentials[f.key]);
  if (missing) return { ok: false, error: `Fill in “${missing.label}”.` };

  // 1. Prove the login works before saving anything.
  let externalIds: string[] = [];
  try {
    externalIds = (await adapter.fetchDevices(credentials)).map((d) => d.externalId);
  } catch (error) {
    return { ok: false, error: describeGpsError(error) };
  }
  const deviceCount = externalIds.length;

  const admin = createAdminClient();
  const accountLabel = adapter.accountLabel(credentials);
  const serverUrl = credentials.server_url ?? null;

  // 2. Same account connected before → update it rather than duplicating.
  //    A new key for the same account has a different label, so we also
  //    recognise the account by its trackers (same tracker ids = same account).
  const existing = await loadGpsConnections(admin, orgId);
  let match = existing.find((c) => c.id === input.connectionId);
  const sameProvider = existing.filter((c) => c.provider === adapter.key);
  if (!match && sameProvider.length > 0 && externalIds.length > 0) {
    const { data: overlap } = await admin
      .from('gps_devices')
      .select('connection_id')
      .in('connection_id', sameProvider.map((c) => c.id))
      .in('external_id', externalIds.slice(0, 300))
      .limit(1);
    const hit = (overlap ?? [])[0] as { connection_id: string } | undefined;
    match = sameProvider.find((c) => c.id === hit?.connection_id);
  }
  match ??= sameProvider.find((c) => c.account_label === accountLabel && c.server_url === serverUrl);

  const row = {
    organization_id: orgId,
    provider: adapter.key,
    server_url: serverUrl,
    account_label: accountLabel,
    credentials_enc: sealCredentials(credentials),
    status: 'connected' as const,
    last_error: null,
    last_synced_at: null,
    connected_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const saved = match
    ? await admin.from('gps_connections').update(row).eq('id', match.id).eq('organization_id', orgId).select('*').single()
    : await admin.from('gps_connections').insert(row).select('*').single();

  if (saved.error || !saved.data) {
    console.error('connectGpsAction: saving the connection failed:', saved.error);
    return {
      ok: false,
      error: isMissingTable(saved.error?.code)
        ? 'GPS trackers aren’t switched on for this workspace yet. Please contact support.'
        : 'Could not save the connection. Please try again.',
    };
  }

  await setGpsModule(admin, orgId, true);

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: match ? 'update' : 'create',
    entityType: 'gps_connection',
    entityId: (saved.data as GpsConnection).id,
    summary: `${match ? 'Reconnected' : 'Connected'} ${adapter.name} GPS (${deviceCount} tracker${deviceCount === 1 ? '' : 's'})`,
    details: { provider: adapter.key, account: accountLabel, server: serverUrl },
  });

  // 3. First import (forced — the claim window doesn't apply to a fresh connect).
  const sync = await syncGpsConnection(admin, saved.data as GpsConnection, { force: true });

  revalidatePath('/fleet', 'layout');
  return {
    ok: true,
    devices: sync.devices || deviceCount,
    linked: sync.linked,
    warning: sync.ok ? undefined : `Connected, but the first import didn’t finish: ${sync.error}`,
  };
}

/** Pulls the latest positions right now (the scheduler does this every minute). */
export async function syncGpsNowAction(connectionId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();
  const conn = (await loadGpsConnections(admin, user.organization_id)).find((c) => c.id === connectionId);
  if (!conn) return { error: 'That GPS account isn’t connected any more.' };

  const res = await syncGpsConnection(admin, conn, { minIntervalMs: 10_000 });
  revalidatePath('/fleet/gps');
  if (!res.ran) return { ok: true, message: 'Already up to date — synced a few seconds ago.' };
  if (!res.ok) return { error: res.error };
  return {
    ok: true,
    message: `Synced ${res.devices} tracker${res.devices === 1 ? '' : 's'} (${res.linked} linked to a vehicle).`,
  };
}

/** Removes the GPS account, its trackers and their history. */
export async function disconnectGpsAction(connectionId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const all = await loadGpsConnections(admin, orgId);
  const conn = all.find((c) => c.id === connectionId);
  if (!conn) return { ok: true };

  // Rovora GPS: take the trackers and the fleet's hidden account off our server too.
  if (conn.provider === 'rovora') {
    const cfg = hostedGpsConfig();
    if (cfg) {
      const { data: hosted } = await admin
        .from('gps_devices')
        .select('external_id')
        .eq('connection_id', conn.id);
      for (const d of (hosted ?? []) as { external_id: string }[]) {
        await deleteFleetDevice(cfg, Number(d.external_id)).catch((err) =>
          console.error('disconnect: removing Rovora GPS device failed', err),
        );
      }
      try {
        const userId = Number((JSON.parse(openSecret(conn.credentials_enc)) as GpsCredentials).traccar_user_id);
        if (userId) await deleteFleetAccount(cfg, userId);
      } catch (err) {
        console.error('disconnect: removing Rovora GPS fleet account failed', err);
      }
    }
  }

  const { error } = await admin.from('gps_connections').delete().eq('id', conn.id).eq('organization_id', orgId);
  if (error) {
    console.error('disconnectGpsAction failed:', error);
    return { error: 'Could not disconnect. Please try again.' };
  }
  if (all.length === 1) await setGpsModule(admin, orgId, false);
  if (conn.provider === 'rovora') await syncGpsTrackerBillingSafe(orgId);

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'delete',
    entityType: 'gps_connection',
    entityId: conn.id,
    summary: `Disconnected ${getGpsProvider(conn.provider)?.name ?? conn.provider} GPS`,
    details: { provider: conn.provider, account: conn.account_label },
  });

  revalidatePath('/fleet', 'layout');
  return { ok: true };
}

/**
 * Puts a tracker in a vehicle (or in none, `vehicleId = null`). A vehicle has
 * at most one tracker: if another tracker was linked to it, that one is
 * unlinked. Manual links are never overwritten by the automatic matching.
 */
export async function linkGpsDeviceAction(deviceId: string, vehicleId: string | null): Promise<Result> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const { data: device } = await admin
    .from('gps_devices')
    .select('id, name, vehicle_id')
    .eq('id', deviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!device) return { error: 'Tracker not found.' };

  let plate: string | null = null;
  if (vehicleId) {
    const { data: vehicle } = await admin
      .from('vehicles')
      .select('id, registration_number')
      .eq('id', vehicleId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!vehicle) return { error: 'Vehicle not found.' };
    plate = vehicle.registration_number;

    // Free the vehicle from whichever tracker had it.
    await admin
      .from('gps_devices')
      .update({ vehicle_id: null, link_source: 'manual' })
      .eq('organization_id', orgId)
      .eq('vehicle_id', vehicleId)
      .neq('id', deviceId);
  }

  const { error } = await admin
    .from('gps_devices')
    .update({ vehicle_id: vehicleId, link_source: 'manual' })
    .eq('id', deviceId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('linkGpsDeviceAction failed:', error);
    return { error: 'Could not save. Please try again.' };
  }

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'update',
    entityType: 'gps_device',
    entityId: deviceId,
    summary: vehicleId
      ? `Linked GPS tracker “${device.name ?? deviceId}” to ${plate ?? 'a vehicle'}`
      : `Unlinked GPS tracker “${device.name ?? deviceId}” from its vehicle`,
    details: { vehicle_id: vehicleId, previous_vehicle_id: device.vehicle_id },
  });

  // Rovora GPS trackers are named after their car on the GPS server too.
  await renameRovoraTrackerForVehicle(deviceId, orgId);

  revalidatePath('/fleet/gps');
  return { ok: true };
}

// =============================================================================
// ROVORA GPS — trackers on Rovora's own GPS server
// =============================================================================

type AddTrackerResult =
  | { ok: true; deviceId: string; imei: string; name: string }
  | { ok: false; error: string };

/** The fleet's Rovora GPS connection, created (with its hidden server account) on first use. */
async function ensureRovoraConnection(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  userId: string,
): Promise<GpsConnection> {
  const existing = (await loadGpsConnections(admin, orgId)).find((c) => c.provider === 'rovora');
  if (existing) return existing;

  const cfg = hostedGpsConfig();
  if (!cfg) throw new GpsProviderError('config', 'Rovora GPS isn’t switched on yet.');
  const { data: org } = await admin.from('organizations').select('name').eq('id', orgId).maybeSingle();
  const account = await createFleetAccount(cfg, orgId, (org?.name as string | undefined) ?? orgId);

  const { data, error } = await admin
    .from('gps_connections')
    .insert({
      organization_id: orgId,
      provider: 'rovora',
      server_url: null,
      account_label: 'Plug-and-play trackers',
      credentials_enc: sealCredentials({
        email: account.email,
        password: account.password,
        traccar_user_id: String(account.userId),
      }),
      status: 'connected',
      connected_by: userId,
    })
    .select('*')
    .single();
  if (error || !data) {
    await deleteFleetAccount(cfg, account.userId);
    throw error ?? new Error('Could not save the Rovora GPS connection.');
  }
  await setGpsModule(admin, orgId, true);
  return data as GpsConnection;
}

/**
 * Adds a tracker to Rovora GPS: registers its IMEI on the GPS server, gives the
 * fleet access, and (optionally) puts it in a vehicle. The tracker then shows
 * "Waiting for first signal" until it has been texted the setup message.
 */
export async function addRovoraTrackerAction(input: {
  imei: string;
  vehicleId?: string | null;
}): Promise<AddTrackerResult> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const cfg = hostedGpsConfig();
  if (!cfg) return { ok: false, error: 'Rovora GPS isn’t switched on yet.' };

  const imei = (input.imei ?? '').replace(/\D/g, '');
  if (!isValidImei(imei)) {
    return {
      ok: false,
      error: 'That IMEI doesn’t look right. It’s the 15-digit number on the tracker’s label (and on its box).',
    };
  }

  const admin = createAdminClient();

  // One fleet per tracker.
  const { data: owner } = await admin
    .from('gps_devices')
    .select('organization_id')
    .eq('provider', 'rovora')
    .eq('unique_id', imei)
    .maybeSingle();
  if (owner) {
    return {
      ok: false,
      error:
        owner.organization_id === orgId
          ? 'This tracker is already added.'
          : 'This tracker is registered to another fleet. If it’s yours, contact support and we’ll move it.',
    };
  }

  let vehicle: { id: string; registration_number: string | null } | null = null;
  if (input.vehicleId) {
    const { data } = await admin
      .from('vehicles')
      .select('id, registration_number')
      .eq('id', input.vehicleId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!data) return { ok: false, error: 'Vehicle not found.' };
    vehicle = data;
  }
  const name = vehicle?.registration_number || `Tracker …${imei.slice(-4)}`;

  let conn: GpsConnection;
  let device: { id: number };
  try {
    conn = await ensureRovoraConnection(admin, orgId, user.id);
    const userIdOnServer = Number(openCredentials(conn).traccar_user_id);
    device = await addFleetDevice(cfg, userIdOnServer, imei, name);
  } catch (error) {
    console.error('addRovoraTrackerAction failed:', error);
    return { ok: false, error: describeGpsError(error) };
  }

  // The car can only have one tracker — free it from any other.
  if (vehicle) {
    await admin
      .from('gps_devices')
      .update({ vehicle_id: null, link_source: 'manual' })
      .eq('organization_id', orgId)
      .eq('vehicle_id', vehicle.id);
  }

  const { data: row, error } = await admin
    .from('gps_devices')
    .upsert(
      {
        organization_id: orgId,
        connection_id: conn.id,
        provider: 'rovora',
        external_id: String(device.id),
        name,
        unique_id: imei,
        vehicle_id: vehicle?.id ?? null,
        link_source: 'manual',
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'connection_id,external_id' },
    )
    .select('id')
    .single();
  if (error || !row) {
    console.error('addRovoraTrackerAction: saving the tracker failed:', error);
    await deleteFleetDevice(cfg, device.id).catch(() => undefined);
    return { ok: false, error: 'Could not save the tracker. Please try again.' };
  }

  await syncGpsTrackerBillingSafe(orgId);
  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'create',
    entityType: 'gps_device',
    entityId: row.id as string,
    summary: `Added Rovora GPS tracker …${imei.slice(-4)}${vehicle ? ` in ${vehicle.registration_number}` : ''}`,
    details: { imei, vehicle_id: vehicle?.id ?? null },
  });

  revalidatePath('/fleet', 'layout');
  return { ok: true, deviceId: row.id as string, imei, name };
}

/** Removes a Rovora GPS tracker from the fleet and from the GPS server. */
export async function removeRovoraTrackerAction(deviceId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const { data: device } = await admin
    .from('gps_devices')
    .select('id, external_id, unique_id, name, provider')
    .eq('id', deviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!device || device.provider !== 'rovora') return { error: 'Tracker not found.' };

  const cfg = hostedGpsConfig();
  if (cfg) {
    try {
      await deleteFleetDevice(cfg, Number(device.external_id));
    } catch (error) {
      console.error('removeRovoraTrackerAction: GPS server refused', error);
      return { error: describeGpsError(error) };
    }
  }
  await admin.from('gps_devices').delete().eq('id', device.id).eq('organization_id', orgId);
  await syncGpsTrackerBillingSafe(orgId);

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'delete',
    entityType: 'gps_device',
    entityId: device.id as string,
    summary: `Removed Rovora GPS tracker “${device.name ?? device.unique_id}”`,
    details: { imei: device.unique_id },
  });

  revalidatePath('/fleet/gps');
  return { ok: true };
}

/** Keeps a Rovora GPS tracker's name on the server in step with its car's plate. */
async function renameRovoraTrackerForVehicle(deviceRowId: string, orgId: string): Promise<void> {
  const cfg = hostedGpsConfig();
  if (!cfg) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from('gps_devices')
    .select('external_id, unique_id, provider, vehicles:vehicle_id (registration_number)')
    .eq('id', deviceRowId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data || data.provider !== 'rovora') return;
  const rel = (Array.isArray(data.vehicles) ? data.vehicles[0] : data.vehicles) as
    | { registration_number: string | null }
    | null
    | undefined;
  const name = rel?.registration_number || `Tracker …${String(data.unique_id).slice(-4)}`;
  await renameFleetDevice(cfg, Number(data.external_id), String(data.unique_id), name);
  await admin.from('gps_devices').update({ name }).eq('id', deviceRowId);
}

/** Privacy: only show cars (and keep their route) while a driver is on shift in them. */
export async function setGpsPrivacyAction(hideOffShift: boolean): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({ gps_hide_off_shift: hideOffShift })
    .eq('id', user.organization_id);
  if (error) {
    console.error('setGpsPrivacyAction failed:', error);
    return {
      error:
        isMissingTable(error.code) || error.code === '42703'
          ? 'This setting isn’t available yet. Please contact support.'
          : 'Could not save. Please try again.',
    };
  }
  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: user.organization_id,
    action: 'update',
    entityType: 'organization',
    entityId: user.organization_id,
    summary: hideOffShift
      ? 'GPS privacy: cars only shown while a driver is on shift'
      : 'GPS privacy: cars shown at all times',
    details: { gps_hide_off_shift: hideOffShift },
  });
  revalidatePath('/fleet/gps');
  revalidatePath('/fleet/tracking');
  return { ok: true };
}
