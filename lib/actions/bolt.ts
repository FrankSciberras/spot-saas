'use server';

// =============================================================================
// BOLT INTEGRATION ACTIONS (fleet admin only)
// =============================================================================
// Connecting, syncing and disconnecting a fleet's Bolt account. Every action
// re-checks the ADMIN role for the caller's ACTIVE fleet and then works with the
// service-role client scoped to that organization_id — the Bolt tables have no
// client-side access at all (see 20261110_bolt_integration.sql).
//
// The Bolt key secret is encrypted before it is stored and is never sent back
// to the browser by any action.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { sealSecret } from '@/lib/crypto/secret-box';
import { BoltClient, describeBoltError, type BoltCompany } from '@/lib/bolt/client';
import { loadBoltConnection, syncBoltFleet, type BoltConnection } from '@/lib/bolt/sync';

export interface BoltCompanyChoice {
  company_id: number;
  name: string;
  city: string | null;
}

type ConnectResult =
  | { ok: true; drivers: number; vehicles: number; rides: number; warning?: string }
  /** The key reaches several Bolt companies — ask which one to connect. */
  | { ok: false; chooseCompany: BoltCompanyChoice[] }
  | { ok: false; error: string };

type Result = { ok?: boolean; error?: string; message?: string };

const companyLabel = (c: BoltCompany) => c.legal_name || c.city_name || `Bolt company ${c.company_id}`;

/**
 * Checks a Bolt API key, stores it (secret encrypted) and imports the fleet's
 * drivers, vehicles and recent ride history.
 */
export async function connectBoltAction(input: {
  clientId: string;
  clientSecret: string;
  companyId?: number | null;
}): Promise<ConnectResult> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;

  const clientId = input.clientId?.trim() ?? '';
  const clientSecret = input.clientSecret?.trim() ?? '';
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Paste both the Client ID and the Client secret from your Bolt Fleet Portal.' };
  }
  if (clientId.length > 200 || clientSecret.length > 500) {
    return { ok: false, error: 'That doesn’t look like a Bolt API key. Copy it again from the Bolt Fleet Portal.' };
  }

  // 1. Prove the key works, and find out which companies it can read.
  let companies: BoltCompany[];
  try {
    companies = (await new BoltClient({ clientId, clientSecret }).getCompanies()).filter(
      (c) => c.status_code === 'active',
    );
  } catch (error) {
    return { ok: false, error: describeBoltError(error) };
  }
  if (companies.length === 0) {
    return {
      ok: false,
      error:
        'This key works, but it can’t see any active Bolt company. In the Bolt Fleet Portal, open the key and check its Companies setting.',
    };
  }

  let company = companies[0];
  if (companies.length > 1) {
    const chosen = companies.find((c) => c.company_id === Number(input.companyId));
    if (!chosen) {
      return {
        ok: false,
        chooseCompany: companies.map((c) => ({ company_id: c.company_id, name: companyLabel(c), city: c.city_name })),
      };
    }
    company = chosen;
  }

  // 2. Store the connection. Reconnecting replaces the key but keeps the data
  //    already imported — unless it now points at a DIFFERENT Bolt company, in
  //    which case the old company's data must not be mixed in.
  const admin = createAdminClient();
  const existing = await loadBoltConnection(admin, orgId);
  const companyChanged = Boolean(existing && Number(existing.company_id) !== company.company_id);
  if (companyChanged) await deleteBoltData(admin, orgId);

  const { error: saveError } = await admin.from('bolt_connections').upsert(
    {
      organization_id: orgId,
      client_id: clientId,
      client_secret_enc: sealSecret(clientSecret),
      company_id: company.company_id,
      company_name: company.legal_name,
      city_name: company.city_name,
      country_code: company.country_code,
      status: 'connected',
      last_error: null,
      connected_by: user.id,
      ...(companyChanged || !existing
        ? { last_synced_at: null, rides_synced_from: null, rides_synced_through: null }
        : {}),
    },
    { onConflict: 'organization_id' },
  );
  if (saveError) {
    console.error('connectBoltAction: saving the connection failed:', saveError);
    // 42P01 = the table doesn't exist yet → the migration hasn't been applied.
    return {
      ok: false,
      error:
        saveError.code === '42P01' || saveError.code === 'PGRST205'
          ? 'The Bolt integration isn’t switched on for this workspace yet. Please contact support.'
          : 'Could not save the connection. Please try again.',
    };
  }

  // 3. Show "Bolt" in the sidebar for this fleet.
  await admin
    .from('org_modules')
    .upsert({ organization_id: orgId, module_key: 'bolt', is_enabled: true }, { onConflict: 'organization_id,module_key' });

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: existing ? 'update' : 'create',
    entityType: 'bolt_connection',
    entityId: String(company.company_id),
    summary: `${existing ? 'Reconnected' : 'Connected'} Bolt (${companyLabel(company)})`,
    details: { company_id: company.company_id, city: company.city_name, key: maskKey(clientId) },
  });

  // 4. First import. If this stumbles the connection still stands — the hourly
  //    job (or "Sync now") picks it up.
  const fresh = (await loadBoltConnection(admin, orgId)) as BoltConnection;
  const sync = await syncBoltFleet(admin, fresh);

  revalidatePath('/fleet', 'layout');
  return {
    ok: true,
    drivers: sync.drivers,
    vehicles: sync.vehicles,
    rides: sync.rides,
    warning: sync.ok ? undefined : `Connected, but the first import didn’t finish: ${sync.error}`,
  };
}

/** Pulls the latest Bolt data right now (the hourly job does this on its own). */
export async function syncBoltNowAction(): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();

  const conn = await loadBoltConnection(admin, user.organization_id);
  if (!conn) return { error: 'Bolt isn’t connected yet.' };

  // Guard against a double-click hammering Bolt's rate limit.
  if (conn.last_synced_at && Date.now() - new Date(conn.last_synced_at).getTime() < 60_000) {
    return { ok: true, message: 'Already up to date — synced less than a minute ago.' };
  }

  const sync = await syncBoltFleet(admin, conn);
  revalidatePath('/fleet/bolt');
  if (!sync.ok) return { error: sync.error };
  return { ok: true, message: `Synced ${sync.rides} recent rides, ${sync.drivers} drivers and ${sync.vehicles} vehicles.` };
}

/**
 * Removes the Bolt connection AND everything imported from it. The key itself
 * stays valid at Bolt until the operator deletes it in the Bolt Fleet Portal.
 */
export async function disconnectBoltAction(): Promise<Result> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const conn = await loadBoltConnection(admin, orgId);
  if (!conn) return { ok: true };

  await deleteBoltData(admin, orgId);
  const { error } = await admin.from('bolt_connections').delete().eq('organization_id', orgId);
  if (error) {
    console.error('disconnectBoltAction failed:', error);
    return { error: 'Could not disconnect. Please try again.' };
  }

  await admin
    .from('org_modules')
    .upsert({ organization_id: orgId, module_key: 'bolt', is_enabled: false }, { onConflict: 'organization_id,module_key' });

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'delete',
    entityType: 'bolt_connection',
    entityId: String(conn.company_id),
    summary: `Disconnected Bolt (${conn.company_name || conn.city_name || conn.company_id}) and removed its imported data`,
  });

  revalidatePath('/fleet', 'layout');
  return { ok: true };
}

/**
 * Links a Bolt driver to one of the fleet's Rovora drivers (or unlinks, with
 * driverId = null). A manual choice is never overwritten by later syncs.
 */
export async function linkBoltDriverAction(boltUuid: string, driverId: string | null): Promise<Result> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();

  if (!boltUuid) return { error: 'Unknown Bolt driver.' };

  if (driverId) {
    // The target must be a driver of THIS fleet — never trust the id blindly.
    const { data: driver } = await admin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!driver) return { error: 'That driver isn’t in this fleet.' };
  }

  const { data, error } = await admin
    .from('bolt_drivers')
    .update({ driver_id: driverId, link_source: 'manual' })
    .eq('organization_id', orgId)
    .eq('bolt_uuid', boltUuid)
    .select('bolt_uuid');

  if (error || !data?.length) {
    if (error) console.error('linkBoltDriverAction failed:', error);
    return { error: 'Could not update the link. Please try again.' };
  }

  revalidatePath('/fleet/bolt');
  return { ok: true };
}

// --- helpers -------------------------------------------------------------------

async function deleteBoltData(admin: ReturnType<typeof createAdminClient>, orgId: string) {
  for (const table of ['bolt_rides', 'bolt_drivers', 'bolt_vehicles']) {
    const { error } = await admin.from(table).delete().eq('organization_id', orgId);
    if (error) console.error(`Clearing ${table} failed:`, error);
  }
}

/** "AVVg…KbtUyb" — enough to recognise a key, not enough to use it. */
function maskKey(clientId: string): string {
  return clientId.length <= 8 ? '••••' : `${clientId.slice(0, 4)}…${clientId.slice(-4)}`;
}
