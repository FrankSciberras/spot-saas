// =============================================================================
// XERO — running a sync for one fleet (SERVER ONLY)
// =============================================================================
// The engine (lib/xero/engine.ts) decides what to send. This file gives it the
// three things it needs — Rovora's records, the sync ledger, and an API client
// with a working token — and makes sure only one sync runs per fleet at a time.
//
// TOKENS. Xero's access token lasts 30 minutes and its refresh token is
// replaced on every refresh. Losing the new refresh token would disconnect the
// fleet, so a refresh is saved straight away, and only if nobody else saved one
// first (token_version); the loser simply reads the winner's tokens.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { after } from 'next/server';
import { openSecret, sealSecret } from '@/lib/crypto/secret-box';
import { appUrl } from '@/lib/urls';
import { XeroHttpApi, isXeroConfigured, refreshTokens } from './client';
import { runXeroSync } from './engine';
import {
  XeroError,
  normaliseXeroSettings,
  type LocalAllocation,
  type LocalBankLine,
  type LocalCustomer,
  type LocalDocument,
  type LocalLine,
  type LocalPayment,
  type LocalSnapshot,
  type SyncItem,
  type SyncLedger,
  type SyncOutcome,
  type XeroSettings,
} from './types';

type Admin = SupabaseClient;

export interface XeroConnection {
  organization_id: string;
  tenant_id: string;
  tenant_name: string | null;
  connection_id: string | null;
  org_base_currency: string | null;
  org_country: string | null;
  org_short_code: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  access_expires_at: string;
  token_version: number;
  scopes: string | null;
  status: 'connected' | 'needs_reconnect';
  last_error: string | null;
  settings: unknown;
  sync_started_at: string | null;
  last_synced_at: string | null;
  created_at: string;
}

const LOCK_STALE_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 2 * 60_000;
const PAGE = 1000;

export function isXeroNotInstalled(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === '42P01' || error.code === 'PGRST205'));
}

/** The fleet's Xero connection, or null when it has none (or the tables don't exist yet). */
export async function loadXeroConnection(admin: Admin, orgId: string): Promise<XeroConnection | null> {
  const { data, error } = await admin.from('xero_connections').select('*').eq('organization_id', orgId).maybeSingle();
  if (error) {
    if (!isXeroNotInstalled(error)) console.error('xero: loading the connection failed:', error);
    return null;
  }
  return (data as XeroConnection | null) ?? null;
}

/** Settings with the one default that depends on the connection: the start date. */
export function connectionSettings(conn: XeroConnection): XeroSettings {
  const settings = normaliseXeroSettings(conn.settings);
  // Never "everything since the beginning of time" by accident.
  return { ...settings, sync_from: settings.sync_from ?? conn.created_at.slice(0, 10) };
}

async function markNeedsReconnect(admin: Admin, orgId: string, message: string) {
  await admin
    .from('xero_connections')
    .update({ status: 'needs_reconnect', last_error: message })
    .eq('organization_id', orgId);
}

/**
 * A valid access token for the fleet. Refreshes when the stored one is about
 * to expire (or when `force` is set, after Xero answered 401).
 */
export async function xeroAccessToken(admin: Admin, orgId: string, force = false): Promise<string> {
  const conn = await loadXeroConnection(admin, orgId);
  if (!conn) throw new XeroError('auth', 'Xero is not connected.');

  let access: string;
  let refresh: string;
  try {
    access = openSecret(conn.access_token_enc);
    refresh = openSecret(conn.refresh_token_enc);
  } catch {
    const message = 'The saved Xero sign-in can no longer be read. Connect Xero again.';
    await markNeedsReconnect(admin, orgId, message);
    throw new XeroError('auth', message);
  }

  if (!force && Date.parse(conn.access_expires_at) - Date.now() > REFRESH_MARGIN_MS) return access;

  let tokens;
  try {
    tokens = await refreshTokens(refresh);
  } catch (error) {
    if (error instanceof XeroError && error.kind === 'auth') {
      // Someone else may have refreshed a moment ago and rotated the token.
      const latest = await loadXeroConnection(admin, orgId);
      if (latest && latest.token_version !== conn.token_version) return openSecret(latest.access_token_enc);
      await markNeedsReconnect(admin, orgId, error.message);
    }
    throw error;
  }

  const { data: saved, error: saveError } = await admin
    .from('xero_connections')
    .update({
      access_token_enc: sealSecret(tokens.accessToken),
      refresh_token_enc: sealSecret(tokens.refreshToken),
      access_expires_at: tokens.expiresAt.toISOString(),
      token_version: conn.token_version + 1,
      status: 'connected',
    })
    .eq('organization_id', orgId)
    .eq('token_version', conn.token_version)
    .select('organization_id');
  if (saveError) {
    // The new refresh token could not be stored. The old one still works for
    // 30 minutes, so the next run can try again — but say so loudly.
    console.error('xero: saving refreshed tokens failed:', saveError);
    return tokens.accessToken;
  }
  if (!saved || saved.length === 0) {
    // Lost the race: use what the winner stored.
    const latest = await loadXeroConnection(admin, orgId);
    if (latest) return openSecret(latest.access_token_enc);
  }
  return tokens.accessToken;
}

/** An API client for the fleet's connected Xero organisation. */
export function xeroApiFor(admin: Admin, conn: Pick<XeroConnection, 'organization_id' | 'tenant_id'>): XeroHttpApi {
  return new XeroHttpApi(conn.tenant_id, (force) => xeroAccessToken(admin, conn.organization_id, force));
}

// ── The ledger ──────────────────────────────────────────────────────────────

export function supabaseLedger(admin: Admin, orgId: string, tenantId: string): SyncLedger {
  return {
    async load() {
      const rows: SyncItem[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from('xero_sync_items')
          .select('entity_type, entity_id, xero_id, status, remote_state, payload_hash, attempts, last_error, last_attempt_at, synced_at, label, amount')
          .eq('organization_id', orgId)
          .eq('tenant_id', tenantId)
          .order('entity_id')
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`xero: loading the sync ledger failed: ${error.message}`);
        rows.push(...((data ?? []) as SyncItem[]).map((r) => ({ ...r, amount: r.amount === null ? null : Number(r.amount) })));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    async save(item) {
      const { error } = await admin
        .from('xero_sync_items')
        .upsert({ ...item, organization_id: orgId, tenant_id: tenantId }, { onConflict: 'organization_id,tenant_id,entity_type,entity_id' });
      // A result that cannot be written down must stop the run: carrying on
      // could create something in Xero that we then forget we created.
      if (error) throw new Error(`xero: saving a sync result failed: ${error.message}`);
    },
  };
}

// ── Rovora's records ────────────────────────────────────────────────────────

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`xero: reading Rovora's records failed: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function loadSnapshot(admin: Admin, orgId: string, settings: XeroSettings, ledgerItems: SyncItem[]): Promise<LocalSnapshot> {
  const n = (v: unknown) => Number(v);

  const [customers, docs, lines, allocations, payments] = await Promise.all([
    fetchAll<LocalCustomer>((a, b) =>
      admin.from('invoice_customers').select('id, name, email, phone, address, vat_number').eq('organization_id', orgId).order('id').range(a, b),
    ),
    fetchAll<Record<string, unknown>>((a, b) =>
      admin
        .from('invoices')
        .select('id, kind, status, number, customer_id, customer_name, credited_invoice_id, credit_reason, issue_date, due_date, currency, reference, total')
        .eq('organization_id', orgId)
        .in('status', ['issued', 'void'])
        .order('id')
        .range(a, b),
    ),
    fetchAll<Record<string, unknown>>((a, b) =>
      admin
        .from('invoice_lines')
        .select('invoice_id, position, description, quantity, unit_price, tax_rate, line_net, line_tax')
        .eq('organization_id', orgId)
        .order('invoice_id')
        .order('position')
        .range(a, b),
    ),
    fetchAll<Record<string, unknown>>((a, b) =>
      admin.from('invoice_credit_allocations').select('id, credit_note_id, invoice_id, amount, allocated_on').eq('organization_id', orgId).order('id').range(a, b),
    ),
    fetchAll<Record<string, unknown>>((a, b) =>
      admin.from('invoice_payments').select('id, invoice_id, paid_on, amount, reference').eq('organization_id', orgId).order('id').range(a, b),
    ),
  ]);

  const linesByDoc = new Map<string, LocalLine[]>();
  for (const l of lines) {
    const list = linesByDoc.get(l.invoice_id as string) ?? [];
    list.push({
      description: String(l.description ?? ''),
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      tax_rate: n(l.tax_rate),
      line_net: n(l.line_net),
      line_tax: n(l.line_tax),
    });
    linesByDoc.set(l.invoice_id as string, list);
  }

  const documents: LocalDocument[] = docs.map((d) => ({
    id: d.id as string,
    kind: d.kind as LocalDocument['kind'],
    status: d.status as LocalDocument['status'],
    number: String(d.number ?? ''),
    customer_id: d.customer_id as string,
    customer_name: String(d.customer_name ?? ''),
    credited_invoice_id: (d.credited_invoice_id as string | null) ?? null,
    credit_reason: (d.credit_reason as string | null) ?? null,
    issue_date: String(d.issue_date),
    due_date: String(d.due_date),
    currency: String(d.currency),
    reference: (d.reference as string | null) ?? null,
    total: n(d.total),
    lines: linesByDoc.get(d.id as string) ?? [],
  }));

  let bankLines: LocalBankLine[] = [];
  let existingBankLineIds: string[] = [];
  if (settings.send_bookkeeping && settings.sync_from) {
    const from = settings.sync_from;
    const rows = await fetchAll<Record<string, unknown>>((a, b) =>
      admin
        .from('finance_transactions')
        .select('id, txn_date, category_id, amount, description, counterparty, source, org_finance_categories:category_id (name, kind)')
        .eq('organization_id', orgId)
        // Lines posted by invoice payments are already in Xero as payments.
        .neq('source', 'invoice')
        .gte('txn_date', from)
        .order('id')
        .range(a, b),
    );
    bankLines = rows.map((r) => {
      const category = r.org_finance_categories as { name?: string; kind?: string } | null;
      return {
        id: r.id as string,
        txn_date: String(r.txn_date),
        category_id: r.category_id as string,
        category_name: category?.name ?? 'Uncategorised',
        kind: category?.kind === 'income' ? 'income' : 'expense',
        amount: n(r.amount),
        description: (r.description as string | null) ?? null,
        counterparty: (r.counterparty as string | null) ?? null,
      };
    });

    // Which already-sent lines still exist? (Asked directly, never inferred
    // from the date-limited list above — see LocalSnapshot.)
    const sentIds = ledgerItems
      .filter((i) => i.entity_type === 'bank_transaction' && i.remote_state === 'active')
      .map((i) => i.entity_id);
    const inList = new Set(bankLines.map((l) => l.id));
    const toCheck = sentIds.filter((id) => !inList.has(id));
    for (let i = 0; i < toCheck.length; i += 200) {
      const chunk = toCheck.slice(i, i + 200);
      const { data, error } = await admin.from('finance_transactions').select('id').eq('organization_id', orgId).in('id', chunk);
      if (error) throw new Error(`xero: reading Rovora's records failed: ${error.message}`);
      existingBankLineIds.push(...(data ?? []).map((r) => r.id as string));
    }
  } else {
    // Feature off: the engine does not touch bookkeeping at all.
    existingBankLineIds = [];
  }

  return {
    customers,
    documents,
    allocations: allocations.map((a) => ({ ...(a as unknown as LocalAllocation), amount: n(a.amount) })),
    payments: payments.map((p) => ({ ...(p as unknown as LocalPayment), amount: n(p.amount) })),
    bankLines,
    existingBankLineIds,
  };
}

// ── One run ─────────────────────────────────────────────────────────────────

export type SyncRunResult =
  | { ok: true; outcome: SyncOutcome }
  | { ok: false; reason: 'not_connected' | 'not_configured' | 'needs_reconnect' | 'busy' | 'failed'; error: string };

/**
 * Sends everything that is waiting for one fleet. Safe to call at any time and
 * from several places at once (a second caller gets `busy`).
 */
export async function syncXeroFleet(admin: Admin, orgId: string, opts: { maxCalls?: number } = {}): Promise<SyncRunResult> {
  if (!isXeroConfigured()) return { ok: false, reason: 'not_configured', error: 'The Xero integration isn’t set up on this workspace yet.' };
  const conn = await loadXeroConnection(admin, orgId);
  if (!conn) return { ok: false, reason: 'not_connected', error: 'Xero is not connected.' };
  if (conn.status === 'needs_reconnect') {
    return { ok: false, reason: 'needs_reconnect', error: conn.last_error ?? 'Xero needs to be connected again.' };
  }

  // Take the lock (or find a fresh one held by another run).
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS).toISOString();
  const { data: locked, error: lockError } = await admin
    .from('xero_connections')
    .update({ sync_started_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    // The timestamp is quoted: it contains ':' and '.', which the filter syntax would otherwise split on.
    .or(`sync_started_at.is.null,sync_started_at.lt."${staleBefore}"`)
    .select('organization_id');
  if (lockError) {
    console.error('xero: taking the sync lock failed:', lockError);
    return { ok: false, reason: 'failed', error: 'The sync could not start. Please try again.' };
  }
  if (!locked || locked.length === 0) return { ok: false, reason: 'busy', error: 'A sync is already running.' };

  let result: SyncRunResult;
  try {
    const settings = connectionSettings(conn);
    const ledger = supabaseLedger(admin, orgId, conn.tenant_id);
    const snapshot = await loadSnapshot(admin, orgId, settings, await ledger.load());
    const outcome = await runXeroSync({
      api: xeroApiFor(admin, conn),
      ledger,
      snapshot,
      settings,
      baseCurrency: conn.org_base_currency,
      appBaseUrl: appUrl().startsWith('https://') ? appUrl() : null,
      maxCalls: opts.maxCalls,
    });
    result = { ok: true, outcome };

    const patch: Record<string, unknown> = { sync_started_at: null };
    if (outcome.stopped === 'auth') {
      patch.status = 'needs_reconnect';
      patch.last_error = outcome.firstError ?? 'Xero needs to be connected again.';
    } else {
      patch.last_synced_at = new Date().toISOString();
      patch.last_error = outcome.stopped === 'rate_limit' ? outcome.firstError : null;
    }
    await admin.from('xero_connections').update(patch).eq('organization_id', orgId);
  } catch (error) {
    console.error('xero: sync failed:', error);
    const message = error instanceof XeroError ? error.message : 'The sync stopped unexpectedly. It will be tried again.';
    const patch: Record<string, unknown> = { sync_started_at: null, last_error: message };
    if (error instanceof XeroError && error.kind === 'auth') patch.status = 'needs_reconnect';
    await admin.from('xero_connections').update(patch).eq('organization_id', orgId);
    result = { ok: false, reason: error instanceof XeroError && error.kind === 'auth' ? 'needs_reconnect' : 'failed', error: message };
  }
  return result;
}

/**
 * Sends changes to Xero right after the response to the person who made them,
 * so an issued invoice shows up there within seconds instead of at the next
 * hourly run. Does nothing unless the fleet is connected with automatic
 * sending on; never throws into the caller.
 */
export function queueXeroSync(orgId: string, createAdmin: () => Admin): void {
  if (!isXeroConfigured()) return;
  try {
    after(async () => {
      try {
        const admin = createAdmin();
        const conn = await loadXeroConnection(admin, orgId);
        if (!conn || conn.status !== 'connected' || !connectionSettings(conn).auto_sync) return;
        await syncXeroFleet(admin, orgId, { maxCalls: 25 });
      } catch (error) {
        console.error('xero: background sync failed:', error);
      }
    });
  } catch {
    // Outside a request (a script, a test): the hourly run will pick it up.
  }
}
