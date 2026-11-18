// =============================================================================
// XERO — OAuth 2 and the HTTP API (SERVER ONLY)
// =============================================================================
// Setup (once, by Rovora): create a "Web app" at developer.xero.com with the
// redirect URI  <app url>/api/xero/callback  and set XERO_CLIENT_ID and
// XERO_CLIENT_SECRET. Until both are set, the Xero page says the integration
// is not available and nothing here is called.
//
// Scopes are Xero's granular ones (the broad accounting.transactions scope is
// deprecated and not issued to new apps since March 2026):
//   offline_access               a refresh token, so syncs run unattended
//   accounting.invoices          create/void invoices and credit notes
//   accounting.payments          payments and refunds
//   accounting.banktransactions  spend / receive money (bookkeeping lines)
//   accounting.contacts          find or create the customer
//   accounting.settings.read     chart of accounts and tax rates, for the mapping screen
//
// Rovora only ever CREATES records and changes records it created (void,
// delete, and edits to bookkeeping lines). It reads accounting data only to
// find something it may already have sent.
// =============================================================================

import { createHash } from 'node:crypto';
import { appUrl } from '@/lib/urls';
import { XeroError, type RemoteDocument, type XeroAccount, type XeroApi, type XeroOrganisation, type XeroTaxRate } from './types';

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const API_BASE = 'https://api.xero.com/api.xro/2.0';
const TIMEOUT_MS = 25_000;

export const XERO_SCOPES = [
  'offline_access',
  'accounting.invoices',
  'accounting.payments',
  'accounting.banktransactions',
  'accounting.contacts',
  'accounting.settings.read',
].join(' ');

export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Null until XERO_CLIENT_ID and XERO_CLIENT_SECRET are set. */
export function xeroConfig(): XeroConfig | null {
  const clientId = process.env.XERO_CLIENT_ID?.trim();
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUri = process.env.XERO_REDIRECT_URI?.trim() || `${appUrl().replace(/\/$/, '')}/api/xero/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function isXeroConfigured(): boolean {
  return xeroConfig() !== null;
}

function requireConfig(): XeroConfig {
  const config = xeroConfig();
  if (!config) throw new XeroError('config', 'The Xero integration isn’t set up on this workspace yet.');
  return config;
}

export function authorizeUrl(state: string): string {
  const config = requireConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: XERO_SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working. */
  expiresAt: Date;
  scopes: string | null;
  /** Identifies this sign-in; used to tell which organisation was just connected. */
  authEventId: string | null;
}

/** Reads a claim from the access token (a JWT). Only used for non-security hints. */
function tokenClaims(accessToken: string): Record<string, unknown> {
  try {
    const part = accessToken.split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const config = requireConfig();
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new XeroError('transient', 'Xero could not be reached. Please try again in a moment.');
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error === 'string' ? json.error : '';
    if (code === 'invalid_grant') {
      throw new XeroError('auth', 'Xero no longer accepts this connection. Connect Xero again.', { status: res.status });
    }
    if (code === 'invalid_client' || code === 'unauthorized_client') {
      console.error('xero: the app credentials were refused:', code);
      throw new XeroError('config', 'The Xero integration isn’t set up correctly on this workspace. Please contact support.', { status: res.status });
    }
    if (res.status >= 500) throw new XeroError('transient', 'Xero is having trouble right now. Please try again in a moment.', { status: res.status });
    throw new XeroError('auth', 'Xero refused the sign-in. Please try connecting again.', { status: res.status });
  }
  const accessToken = String(json.access_token ?? '');
  const refreshToken = String(json.refresh_token ?? '');
  if (!accessToken || !refreshToken) {
    throw new XeroError('auth', 'Xero did not return a complete sign-in. Please try connecting again.');
  }
  const claims = tokenClaims(accessToken);
  const scope = Array.isArray(claims.scope) ? (claims.scope as unknown[]).join(' ') : typeof json.scope === 'string' ? json.scope : null;
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + Math.max(Number(json.expires_in ?? 1800) - 60, 60) * 1000),
    scopes: scope,
    authEventId: typeof claims.authentication_event_id === 'string' ? claims.authentication_event_id : null,
  };
}

/** Step 3 of the sign-in: the one-time code Xero sent back, for tokens. */
export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: requireConfig().redirectUri });
}

/**
 * A new access token. Xero ROTATES the refresh token: the returned one replaces
 * the old one, which keeps working for a 30-minute grace period only.
 */
export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

export interface XeroTenantConnection {
  id: string;
  authEventId: string | null;
  tenantId: string;
  tenantType: string;
  tenantName: string | null;
}

/** The organisations this sign-in can reach. */
export async function listConnections(accessToken: string): Promise<XeroTenantConnection[]> {
  let res: Response;
  try {
    res = await fetch(CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new XeroError('transient', 'Xero could not be reached. Please try again in a moment.');
  }
  if (!res.ok) throw new XeroError(res.status === 401 ? 'auth' : 'transient', 'Xero did not list your organisations. Please try connecting again.', { status: res.status });
  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[];
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: String(r.id ?? ''),
    authEventId: typeof r.authEventId === 'string' ? r.authEventId : null,
    tenantId: String(r.tenantId ?? ''),
    tenantType: String(r.tenantType ?? ''),
    tenantName: typeof r.tenantName === 'string' ? r.tenantName : null,
  }));
}

/** Removes Rovora's access to ONE organisation (best effort on disconnect). */
export async function removeConnection(accessToken: string, connectionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${CONNECTIONS_URL}/${encodeURIComponent(connectionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

// ── API ─────────────────────────────────────────────────────────────────────

interface RequestOptions {
  query?: Record<string, string>;
  body?: unknown;
  idempotencyKey?: string;
}

/** Pulls the human-readable reasons out of a Xero error body. */
export function xeroErrorMessages(body: unknown): string[] {
  const out = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.ValidationErrors)) {
      for (const v of record.ValidationErrors as Record<string, unknown>[]) {
        if (typeof v?.Message === 'string' && v.Message.trim()) out.add(v.Message.trim());
      }
    }
    for (const key of ['Elements', 'LineItems', 'Contact', 'Invoices', 'CreditNotes', 'Payments', 'BankTransactions', 'Contacts', 'Allocations']) {
      if (record[key]) visit(record[key], depth + 1);
    }
  };
  visit(body, 0);
  if (out.size === 0 && body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const message = record.Message ?? record.Detail ?? record.detail ?? record.title;
    if (typeof message === 'string' && message.trim()) out.add(message.trim());
  }
  return [...out];
}

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Xero's `where` strings are double-quoted; values here are ids and our own tags. */
const quoted = (value: string) => `"${value.replace(/["\\]/g, '')}"`;

export class XeroHttpApi implements XeroApi {
  calls = 0;
  private tenantId: string;
  private getToken: (forceRefresh?: boolean) => Promise<string>;

  /**
   * @param getToken returns a valid access token, refreshing (and saving the
   *                 rotated refresh token) when needed; `true` forces a refresh.
   */
  constructor(tenantId: string, getToken: (forceRefresh?: boolean) => Promise<string>) {
    this.tenantId = tenantId;
    this.getToken = getToken;
  }

  private async request(method: 'GET' | 'PUT' | 'POST', path: string, opts: RequestOptions = {}, retried = false): Promise<Record<string, unknown>> {
    const token = await this.getToken(retried);
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'xero-tenant-id': this.tenantId,
      Accept: 'application/json',
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    // Xero caps the key length; ours are hashed to a fixed 64 characters.
    if (opts.idempotencyKey && method !== 'GET') {
      headers['Idempotency-Key'] = createHash('sha256').update(`${this.tenantId}:${opts.idempotencyKey}`).digest('hex');
    }

    this.calls++;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new XeroError('transient', 'Xero did not answer in time. It will be tried again.');
    }

    if (res.status === 401 && !retried) {
      // The access token expired mid-run (or was revoked): refresh once, retry once.
      return this.request(method, path, opts, true);
    }

    const text = await res.text().catch(() => '');
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }

    if (res.ok) return json;

    if (res.status === 401) {
      throw new XeroError('auth', 'Xero no longer accepts this connection. Connect Xero again.', { status: 401 });
    }
    if (res.status === 403) {
      throw new XeroError('auth', 'Rovora no longer has access to this Xero organisation. Connect Xero again.', { status: 403 });
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const which = res.headers.get('x-rate-limit-problem');
      throw new XeroError(
        'rate_limit',
        which === 'day'
          ? 'Xero’s daily limit for this organisation has been reached. Sending carries on tomorrow.'
          : 'Xero asked Rovora to slow down. Sending carries on shortly.',
        { status: 429, retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60 },
      );
    }
    if (res.status === 404) throw new XeroError('not_found', 'Xero could not find that record. It may have been deleted there.', { status: 404 });
    if (res.status >= 500) throw new XeroError('transient', 'Xero is having trouble right now. It will be tried again.', { status: res.status });

    const messages = xeroErrorMessages(json);
    throw new XeroError('validation', messages.length > 0 ? messages.join(' ') : `Xero refused this (${res.status}).`, { status: res.status });
  }

  private static first(json: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const list = json[key];
    return Array.isArray(list) && list.length > 0 ? (list[0] as Record<string, unknown>) : null;
  }

  private static required(json: Record<string, unknown>, key: string, idField: string): Record<string, unknown> {
    const row = XeroHttpApi.first(json, key);
    if (!row || typeof row[idField] !== 'string') {
      throw new XeroError('transient', 'Xero answered without confirming the record. It will be checked and tried again.');
    }
    return row;
  }

  // ── Reference data (mapping screen) ──
  async getOrganisation(): Promise<XeroOrganisation> {
    const row = XeroHttpApi.first(await this.request('GET', '/Organisation'), 'Organisations');
    return {
      Name: String(row?.Name ?? ''),
      BaseCurrency: String(row?.BaseCurrency ?? ''),
      CountryCode: String(row?.CountryCode ?? ''),
      ShortCode: typeof row?.ShortCode === 'string' ? row.ShortCode : null,
    };
  }

  async getAccounts(): Promise<XeroAccount[]> {
    const json = await this.request('GET', '/Accounts', { query: { where: 'Status=="ACTIVE"' } });
    return ((json.Accounts as Record<string, unknown>[]) ?? []).map((a) => ({
      AccountID: String(a.AccountID ?? ''),
      Code: typeof a.Code === 'string' && a.Code ? a.Code : null,
      Name: String(a.Name ?? ''),
      Type: String(a.Type ?? ''),
      Status: String(a.Status ?? ''),
      TaxType: typeof a.TaxType === 'string' ? a.TaxType : null,
      EnablePaymentsToAccount: a.EnablePaymentsToAccount === true,
    }));
  }

  async getTaxRates(): Promise<XeroTaxRate[]> {
    const json = await this.request('GET', '/TaxRates');
    return ((json.TaxRates as Record<string, unknown>[]) ?? [])
      .filter((t) => t.Status === 'ACTIVE')
      .map((t) => ({
        Name: String(t.Name ?? ''),
        TaxType: String(t.TaxType ?? ''),
        Status: String(t.Status ?? ''),
        EffectiveRate: num(t.EffectiveRate),
        CanApplyToRevenue: t.CanApplyToRevenue !== false,
      }));
  }

  // ── Contacts ──
  async findContact(by: { contactNumber?: string; name?: string }): Promise<{ id: string; archived: boolean } | null> {
    let rows: Record<string, unknown>[] = [];
    if (by.contactNumber) {
      const json = await this.request('GET', '/Contacts', {
        query: { where: `ContactNumber==${quoted(by.contactNumber)}`, includeArchived: 'true' },
      });
      rows = (json.Contacts as Record<string, unknown>[]) ?? [];
    } else if (by.name) {
      // searchTerm rather than a where clause: names may contain quotes.
      const json = await this.request('GET', '/Contacts', { query: { searchTerm: by.name, includeArchived: 'true' } });
      const wanted = by.name.trim().toLowerCase();
      rows = ((json.Contacts as Record<string, unknown>[]) ?? []).filter((c) => String(c.Name ?? '').trim().toLowerCase() === wanted);
    }
    // Prefer a live contact over an archived one of the same name.
    const row = rows.find((c) => c.ContactStatus !== 'ARCHIVED') ?? rows[0];
    return row && typeof row.ContactID === 'string' ? { id: row.ContactID, archived: row.ContactStatus === 'ARCHIVED' } : null;
  }

  async createContact(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }> {
    const json = await this.request('PUT', '/Contacts', { body: { Contacts: [payload] }, idempotencyKey });
    return { id: String(XeroHttpApi.required(json, 'Contacts', 'ContactID').ContactID) };
  }

  // ── Invoices ──
  private static remote(row: Record<string, unknown>, idField: string, numberField: string): RemoteDocument {
    return {
      id: String(row[idField]),
      number: typeof row[numberField] === 'string' ? (row[numberField] as string) : null,
      status: String(row.Status ?? ''),
      total: num(row.Total),
    };
  }

  async findInvoiceByNumber(number: string): Promise<RemoteDocument | null> {
    const json = await this.request('GET', '/Invoices', { query: { InvoiceNumbers: number, where: 'Type=="ACCREC"' } });
    const rows = ((json.Invoices as Record<string, unknown>[]) ?? []).filter((i) => i.InvoiceNumber === number);
    // If the number was used and voided, and used again, the live one wins.
    const row = rows.find((i) => i.Status !== 'VOIDED' && i.Status !== 'DELETED') ?? rows[0];
    return row && typeof row.InvoiceID === 'string' ? XeroHttpApi.remote(row, 'InvoiceID', 'InvoiceNumber') : null;
  }

  // PUT, not POST: POST would UPDATE an existing invoice with the same number.
  async createInvoice(payload: Record<string, unknown>, idempotencyKey: string): Promise<RemoteDocument> {
    const json = await this.request('PUT', '/Invoices', { body: { Invoices: [payload] }, idempotencyKey });
    return XeroHttpApi.remote(XeroHttpApi.required(json, 'Invoices', 'InvoiceID'), 'InvoiceID', 'InvoiceNumber');
  }

  async voidInvoice(id: string): Promise<void> {
    await this.request('POST', `/Invoices/${encodeURIComponent(id)}`, { body: { InvoiceID: id, Status: 'VOIDED' } });
  }

  // ── Credit notes ──
  async findCreditNoteByNumber(number: string): Promise<RemoteDocument | null> {
    const json = await this.request('GET', '/CreditNotes', {
      query: { where: `Type=="ACCRECCREDIT" AND CreditNoteNumber==${quoted(number)}` },
    });
    const rows = ((json.CreditNotes as Record<string, unknown>[]) ?? []).filter((c) => c.CreditNoteNumber === number);
    const row = rows.find((c) => c.Status !== 'VOIDED' && c.Status !== 'DELETED') ?? rows[0];
    return row && typeof row.CreditNoteID === 'string' ? XeroHttpApi.remote(row, 'CreditNoteID', 'CreditNoteNumber') : null;
  }

  async createCreditNote(payload: Record<string, unknown>, idempotencyKey: string): Promise<RemoteDocument> {
    const json = await this.request('PUT', '/CreditNotes', { body: { CreditNotes: [payload] }, idempotencyKey });
    return XeroHttpApi.remote(XeroHttpApi.required(json, 'CreditNotes', 'CreditNoteID'), 'CreditNoteID', 'CreditNoteNumber');
  }

  async voidCreditNote(id: string): Promise<void> {
    await this.request('POST', `/CreditNotes/${encodeURIComponent(id)}`, { body: { CreditNoteID: id, Status: 'VOIDED' } });
  }

  async listAllocations(creditNoteId: string): Promise<{ id: string | null; invoiceId: string; amount: number }[]> {
    const json = await this.request('GET', `/CreditNotes/${encodeURIComponent(creditNoteId)}`);
    const row = XeroHttpApi.first(json, 'CreditNotes');
    return ((row?.Allocations as Record<string, unknown>[]) ?? []).map((a) => ({
      id: typeof a.AllocationID === 'string' ? a.AllocationID : null,
      invoiceId: String((a.Invoice as Record<string, unknown> | undefined)?.InvoiceID ?? ''),
      amount: num(a.Amount),
    }));
  }

  async allocateCredit(creditNoteId: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string | null }> {
    const json = await this.request('PUT', `/CreditNotes/${encodeURIComponent(creditNoteId)}/Allocations`, { body: payload, idempotencyKey });
    const row = XeroHttpApi.first(json, 'Allocations');
    return { id: typeof row?.AllocationID === 'string' ? row.AllocationID : null };
  }

  // ── Payments ──
  async findPaymentByReference(reference: string): Promise<{ id: string; status: string } | null> {
    const json = await this.request('GET', '/Payments', { query: { where: `Reference==${quoted(reference)}` } });
    const rows = ((json.Payments as Record<string, unknown>[]) ?? []).filter((p) => p.Reference === reference);
    const row = rows.find((p) => p.Status !== 'DELETED') ?? rows[0];
    return row && typeof row.PaymentID === 'string' ? { id: row.PaymentID, status: String(row.Status ?? '') } : null;
  }

  async createPayment(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }> {
    const json = await this.request('PUT', '/Payments', { body: { Payments: [payload] }, idempotencyKey });
    return { id: String(XeroHttpApi.required(json, 'Payments', 'PaymentID').PaymentID) };
  }

  async deletePayment(id: string): Promise<void> {
    await this.request('POST', `/Payments/${encodeURIComponent(id)}`, { body: { Status: 'DELETED' } });
  }

  // ── Bank transactions ──
  async findBankTransactionByReference(reference: string): Promise<{ id: string; status: string } | null> {
    const json = await this.request('GET', '/BankTransactions', { query: { where: `Reference==${quoted(reference)}` } });
    const rows = ((json.BankTransactions as Record<string, unknown>[]) ?? []).filter((b) => b.Reference === reference);
    const row = rows.find((b) => b.Status !== 'DELETED') ?? rows[0];
    return row && typeof row.BankTransactionID === 'string' ? { id: row.BankTransactionID, status: String(row.Status ?? '') } : null;
  }

  async createBankTransaction(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }> {
    const json = await this.request('PUT', '/BankTransactions', { body: { BankTransactions: [payload] }, idempotencyKey });
    return { id: String(XeroHttpApi.required(json, 'BankTransactions', 'BankTransactionID').BankTransactionID) };
  }

  async updateBankTransaction(id: string, payload: Record<string, unknown>): Promise<void> {
    await this.request('POST', `/BankTransactions/${encodeURIComponent(id)}`, {
      body: { BankTransactions: [{ ...payload, BankTransactionID: id }] },
    });
  }

  async deleteBankTransaction(id: string): Promise<void> {
    await this.request('POST', `/BankTransactions/${encodeURIComponent(id)}`, {
      body: { BankTransactions: [{ BankTransactionID: id, Status: 'DELETED' }] },
    });
  }
}
