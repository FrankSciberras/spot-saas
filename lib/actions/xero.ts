'use server';

// =============================================================================
// XERO INTEGRATION ACTIONS (fleet admin only)
// =============================================================================
// Connecting happens through /api/xero/connect (a redirect to Xero, not an
// action). These cover everything after that: choosing accounts and tax rates,
// sending now, retrying a refused record, and disconnecting.
//
// Every action re-checks the ADMIN role for the caller's ACTIVE fleet and works
// with the service-role client scoped to that organization_id. Tokens are never
// sent to the browser.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { openSecret } from '@/lib/crypto/secret-box';
import { removeConnection } from '@/lib/xero/client';
import { connectionSettings, loadXeroConnection, syncXeroFleet, xeroAccessToken, xeroApiFor } from '@/lib/xero/sync';
import { shapeReferenceData, type XeroReferenceData } from '@/lib/xero/reference';
import { XeroError, normaliseXeroSettings, taxRateKey, type SyncEntityType, type XeroSettings } from '@/lib/xero/types';

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY_TYPES: SyncEntityType[] = ['contact', 'invoice', 'credit_note', 'allocation', 'payment', 'bank_transaction'];

/** The fleet's Xero chart of accounts and tax rates, for the mapping screen. Two API calls. */
export async function loadXeroReferenceDataAction(): Promise<Result<{ data: XeroReferenceData }>> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();
  const conn = await loadXeroConnection(admin, user.organization_id);
  if (!conn) return { ok: false, error: 'Xero is not connected.' };
  try {
    const api = xeroApiFor(admin, conn);
    const [accounts, taxRates] = await Promise.all([api.getAccounts(), api.getTaxRates()]);
    return { ok: true, data: shapeReferenceData(accounts, taxRates) };
  } catch (error) {
    if (error instanceof XeroError) return { ok: false, error: error.message };
    console.error('xero: loading reference data failed:', error);
    return { ok: false, error: 'Your Xero accounts could not be loaded. Please try again.' };
  }
}

/**
 * Saves the admin's choices. Account codes, tax types and the bank account are
 * checked against what the Xero organisation actually has, so a typo or a
 * stale value can't be stored and then fail on every invoice.
 */
export async function saveXeroSettingsAction(input: XeroSettings): Promise<Result> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();
  const conn = await loadXeroConnection(admin, orgId);
  if (!conn) return { ok: false, error: 'Xero is not connected.' };

  const settings = normaliseXeroSettings(input);
  if (!settings.sync_from) return { ok: false, error: 'Choose the date to start sending from.' };

  let reference: XeroReferenceData;
  try {
    const api = xeroApiFor(admin, conn);
    const [accounts, taxRates] = await Promise.all([api.getAccounts(), api.getTaxRates()]);
    reference = shapeReferenceData(accounts, taxRates);
  } catch (error) {
    return { ok: false, error: error instanceof XeroError ? error.message : 'Your choices could not be checked with Xero. Please try again.' };
  }

  if (settings.sales_account_code && !reference.salesAccounts.some((a) => a.code === settings.sales_account_code)) {
    return { ok: false, error: 'That sales account no longer exists in Xero. Choose another.' };
  }
  const taxTypes = new Set(reference.taxRates.map((t) => t.taxType));
  const cleanedTax: Record<string, string> = {};
  for (const [rate, taxType] of Object.entries(settings.tax_types)) {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(rate)) continue;
    if (!taxTypes.has(taxType)) return { ok: false, error: `The Xero tax rate chosen for ${Number(rate)}% VAT no longer exists. Choose another.` };
    cleanedTax[taxRateKey(rate)] = taxType;
  }
  if ((settings.send_payments || settings.send_bookkeeping) && !settings.bank_account_id) {
    return { ok: false, error: 'Choose the Xero bank account payments go through.' };
  }
  if (settings.bank_account_id && !reference.bankAccounts.some((a) => a.id === settings.bank_account_id)) {
    return { ok: false, error: 'That bank account no longer exists in Xero. Choose another.' };
  }

  // Bookkeeping categories must be this fleet's, and their accounts real.
  const cleanedCategories: Record<string, string> = {};
  const categoryIds = Object.keys(settings.category_accounts).filter((id) => UUID.test(id));
  if (categoryIds.length > 0) {
    const { data: own } = await admin.from('org_finance_categories').select('id').eq('organization_id', orgId).in('id', categoryIds);
    const ownIds = new Set((own ?? []).map((c) => c.id as string));
    const codes = new Set(reference.ledgerAccounts.map((a) => a.code));
    for (const id of categoryIds) {
      const code = settings.category_accounts[id];
      if (!ownIds.has(id) || !code) continue;
      if (!codes.has(code)) return { ok: false, error: `Account ${code} no longer exists in Xero. Choose another for that category.` };
      cleanedCategories[id] = code;
    }
  }

  const next: XeroSettings = { ...settings, tax_types: cleanedTax, category_accounts: cleanedCategories };
  const { error } = await admin.from('xero_connections').update({ settings: next }).eq('organization_id', orgId);
  if (error) {
    console.error('xero: saving settings failed:', error);
    return { ok: false, error: 'Your choices could not be saved. Please try again.' };
  }

  // Anything that was waiting on a choice can be tried again straight away.
  await admin
    .from('xero_sync_items')
    .update({ last_error: null })
    .eq('organization_id', orgId)
    .eq('tenant_id', conn.tenant_id)
    .eq('status', 'pending');

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'update',
    entityType: 'xero_connection',
    entityId: conn.tenant_id,
    summary: 'Updated Xero settings',
    details: {
      sync_from: next.sync_from,
      auto_sync: next.auto_sync,
      send_payments: next.send_payments,
      send_bookkeeping: next.send_bookkeeping,
    },
  });
  revalidatePath('/fleet/xero');
  return { ok: true };
}

export async function syncXeroNowAction(): Promise<Result<{ sent: number; failed: number; waiting: number; more: boolean; note: string | null }>> {
  const user = await requireRole(['admin']);
  const result = await syncXeroFleet(createAdminClient(), user.organization_id);
  revalidatePath('/fleet/xero');
  if (!result.ok) return { ok: false, error: result.error };
  const { outcome } = result;
  const note =
    outcome.stopped === 'rate_limit'
      ? outcome.firstError
      : outcome.stopped === 'auth'
        ? outcome.firstError
        : outcome.stopped === 'budget'
          ? 'There is more to send. Press “Send now” again in a minute, or leave it to the hourly run.'
          : outcome.setup[0] ?? null;
  return { ok: true, sent: outcome.sent, failed: outcome.failed, waiting: outcome.waiting, more: outcome.stopped === 'budget', note };
}

/** Clears a refused record's attempt history so the next sync tries it at once. */
export async function retryXeroItemAction(entityType: string, entityId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!ENTITY_TYPES.includes(entityType as SyncEntityType) || !UUID.test(entityId)) {
    return { ok: false, error: 'That record no longer exists.' };
  }
  const admin = createAdminClient();
  const conn = await loadXeroConnection(admin, user.organization_id);
  if (!conn) return { ok: false, error: 'Xero is not connected.' };
  const { error } = await admin
    .from('xero_sync_items')
    // attempts is kept above zero on purpose: it tells the sync an earlier try
    // may have reached Xero, so it looks before creating.
    .update({ status: 'pending', last_attempt_at: null, last_error: null })
    .eq('organization_id', user.organization_id)
    .eq('tenant_id', conn.tenant_id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'error');
  if (error) return { ok: false, error: 'That could not be queued again. Please try again.' };
  const result = await syncXeroFleet(admin, user.organization_id);
  revalidatePath('/fleet/xero');
  return result.ok || result.reason === 'busy' ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Disconnects Xero. Nothing already sent is removed from Xero, and the sync
 * ledger is kept, so connecting the same organisation again later carries on
 * without sending anything twice.
 */
export async function disconnectXeroAction(): Promise<Result> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();
  const conn = await loadXeroConnection(admin, orgId);
  if (!conn) return { ok: true };

  // Best effort: tell Xero to drop this app's access to this organisation.
  if (conn.connection_id) {
    try {
      let token: string;
      try {
        token = await xeroAccessToken(admin, orgId);
      } catch {
        token = openSecret(conn.access_token_enc);
      }
      await removeConnection(token, conn.connection_id);
    } catch {
      // The admin can also remove Rovora under Settings → Connected apps in Xero.
    }
  }

  const { error } = await admin.from('xero_connections').delete().eq('organization_id', orgId);
  if (error) {
    console.error('xero: deleting the connection failed:', error);
    return { ok: false, error: 'Xero could not be disconnected. Please try again.' };
  }
  await admin.from('org_modules').delete().eq('organization_id', orgId).eq('module_key', 'xero');

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'delete',
    entityType: 'xero_connection',
    entityId: conn.tenant_id,
    summary: `Disconnected Xero (${conn.tenant_name ?? 'organisation'})`,
  });
  revalidatePath('/fleet/xero');
  revalidatePath('/fleet', 'layout');
  return { ok: true };
}

/** Used by the page: settings with their connection-dependent defaults. Not an action clients need. */
export async function getXeroSettingsAction(): Promise<Result<{ settings: XeroSettings }>> {
  const user = await requireRole(['admin']);
  const conn = await loadXeroConnection(createAdminClient(), user.organization_id);
  if (!conn) return { ok: false, error: 'Xero is not connected.' };
  return { ok: true, settings: connectionSettings(conn) };
}
