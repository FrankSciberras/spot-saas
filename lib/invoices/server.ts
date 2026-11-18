// =============================================================================
// INVOICES — server-side reads (SERVER ONLY)
// =============================================================================
// The invoice tables are service-role only, so every read goes through here
// with the admin client, ALWAYS filtered by the organization_id of a caller the
// route or action has already checked is an admin of that fleet.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayStatus, todayIn, toCents } from './math';
import {
  INVOICE_TIME_ZONE,
  type CreditAllocation,
  type DocumentDetail,
  type DocumentSummary,
  type InvoiceCustomer,
  type InvoiceDocument,
  type InvoiceLine,
  type InvoicePayment,
  type InvoiceSettings,
} from './types';

type Admin = SupabaseClient;

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

/** True when the invoices migration has not been applied to this database. */
export function isInvoicesNotInstalled(error: DbError | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42883';
}

export const NOT_INSTALLED_MESSAGE =
  'Invoices aren’t switched on for this workspace yet. Please contact support.';

/**
 * Turns a database error into a sentence for the person using the page. The
 * invoice functions raise their own messages (SQLSTATE P0001) written for
 * exactly this purpose; anything else gets a generic line and is logged.
 */
export function invoiceErrorMessage(error: DbError | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (isInvoicesNotInstalled(error)) return NOT_INSTALLED_MESSAGE;
  if (error.code === 'P0001' && error.message) return error.message;
  if (error.code === '23505' && /uq_invoice_customers_name/.test(`${error.message} ${error.details ?? ''}`)) {
    return 'You already have a customer with that name.';
  }
  if (error.code === '23503' && /invoices_customer_id_fkey/.test(`${error.message} ${error.details ?? ''}`)) {
    return 'This customer has invoices, so it can’t be deleted. Archive it instead.';
  }
  console.error('invoices: unexpected database error:', error);
  return fallback;
}

/** Today in the fleet's time zone (YYYY-MM-DD). */
export function invoiceToday(): string {
  return todayIn(INVOICE_TIME_ZONE);
}

const cents = (value: unknown): number => toCents(value as number | string) ?? 0;

/**
 * The fleet's invoice settings, created with sensible defaults on first use:
 * payments are posted to the "Corporate accounts" income category when the
 * fleet has one (otherwise its first income category).
 */
export async function ensureInvoiceSettings(admin: Admin, orgId: string): Promise<{ settings: InvoiceSettings | null; error: string | null }> {
  const first = await admin.from('invoice_settings').select('*').eq('organization_id', orgId).maybeSingle();
  if (first.error) return { settings: null, error: invoiceErrorMessage(first.error) };
  if (first.data) return { settings: normaliseSettings(first.data), error: null };

  const { data: categories } = await admin
    .from('org_finance_categories')
    .select('id, key, kind, sort_order')
    .eq('organization_id', orgId)
    .eq('kind', 'income')
    .eq('is_active', true)
    .order('sort_order');
  const income = categories?.find((c) => c.key === 'corporate') ?? categories?.[0] ?? null;

  // Two tabs opening the page at once must not fail: ignore a lost race.
  const insert = await admin
    .from('invoice_settings')
    .upsert({ organization_id: orgId, income_category_id: income?.id ?? null }, { onConflict: 'organization_id', ignoreDuplicates: true });
  if (insert.error) return { settings: null, error: invoiceErrorMessage(insert.error) };

  const again = await admin.from('invoice_settings').select('*').eq('organization_id', orgId).maybeSingle();
  if (again.error || !again.data) return { settings: null, error: invoiceErrorMessage(again.error) };
  return { settings: normaliseSettings(again.data), error: null };
}

function normaliseSettings(row: Record<string, unknown>): InvoiceSettings {
  return {
    ...(row as unknown as InvoiceSettings),
    default_tax_rate: Number(row.default_tax_rate),
    next_invoice_number: Number(row.next_invoice_number),
    next_credit_note_number: Number(row.next_credit_note_number),
    number_padding: Number(row.number_padding),
    payment_terms_days: Number(row.payment_terms_days),
  };
}

export async function listCustomers(admin: Admin, orgId: string, opts: { includeArchived?: boolean } = {}): Promise<InvoiceCustomer[]> {
  let query = admin.from('invoice_customers').select('*').eq('organization_id', orgId).order('name');
  if (!opts.includeArchived) query = query.is('archived_at', null);
  const { data, error } = await query;
  if (error) {
    if (!isInvoicesNotInstalled(error)) console.error('invoices: listCustomers failed:', error);
    return [];
  }
  return (data ?? []) as InvoiceCustomer[];
}

interface Sums {
  /** invoice_id → cents paid (or refunded, for a credit note) */
  paid: Map<string, number>;
  /** invoice_id → cents of credit applied TO that invoice */
  creditedTo: Map<string, number>;
  /** credit_note_id → cents of that credit note applied to invoices */
  appliedFrom: Map<string, number>;
}

async function loadSums(admin: Admin, orgId: string, ids?: string[]): Promise<Sums> {
  const sums: Sums = { paid: new Map(), creditedTo: new Map(), appliedFrom: new Map() };
  let payments = admin.from('invoice_payments').select('invoice_id, amount').eq('organization_id', orgId);
  let allocations = admin.from('invoice_credit_allocations').select('credit_note_id, invoice_id, amount').eq('organization_id', orgId);
  if (ids) {
    payments = payments.in('invoice_id', ids);
    allocations = allocations.or(`invoice_id.in.(${ids.join(',')}),credit_note_id.in.(${ids.join(',')})`);
  }
  const [p, a] = await Promise.all([payments, allocations]);
  const add = (map: Map<string, number>, key: string, amount: unknown) => map.set(key, (map.get(key) ?? 0) + cents(amount));
  for (const row of p.data ?? []) add(sums.paid, row.invoice_id as string, row.amount);
  for (const row of a.data ?? []) {
    add(sums.creditedTo, row.invoice_id as string, row.amount);
    add(sums.appliedFrom, row.credit_note_id as string, row.amount);
  }
  return sums;
}

function summarise(doc: InvoiceDocument & { invoice_customers?: { name: string } | null }, sums: Sums, today: string): DocumentSummary {
  const total = cents(doc.total);
  const paid = sums.paid.get(doc.id) ?? 0;
  const credited = doc.kind === 'invoice' ? sums.creditedTo.get(doc.id) ?? 0 : sums.appliedFrom.get(doc.id) ?? 0;
  const balance = doc.status === 'issued' ? Math.max(total - paid - credited, 0) : 0;
  const { invoice_customers: live, ...rest } = doc;
  return {
    ...rest,
    subtotal: Number(doc.subtotal),
    tax_total: Number(doc.tax_total),
    total: Number(doc.total),
    display_customer: doc.customer_name ?? live?.name ?? 'Unknown customer',
    paid_cents: paid,
    credited_cents: credited,
    balance_cents: balance,
    display_status: displayStatus({ kind: doc.kind, status: doc.status, total, balance, dueDate: doc.due_date, today }),
  };
}

/** Every invoice and credit note of the fleet, newest first. */
export async function listDocuments(admin: Admin, orgId: string): Promise<{ documents: DocumentSummary[]; error: string | null }> {
  const { data, error } = await admin
    .from('invoices')
    .select('*, invoice_customers:customer_id (name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) return { documents: [], error: invoiceErrorMessage(error) };
  const sums = await loadSums(admin, orgId);
  const today = invoiceToday();
  return { documents: (data ?? []).map((d) => summarise(d as InvoiceDocument, sums, today)), error: null };
}

/** One document with its lines, payments, credit links and customer. */
export async function getDocument(admin: Admin, orgId: string, id: string): Promise<DocumentDetail | null> {
  const { data: doc, error } = await admin
    .from('invoices')
    .select('*, invoice_customers:customer_id (name)')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (error || !doc) {
    if (error && !isInvoicesNotInstalled(error)) console.error('invoices: getDocument failed:', error);
    return null;
  }

  const [lines, payments, allocations, customer, related, sums] = await Promise.all([
    admin.from('invoice_lines').select('*').eq('invoice_id', id).eq('organization_id', orgId).order('position'),
    admin.from('invoice_payments').select('*').eq('invoice_id', id).eq('organization_id', orgId).order('paid_on').order('created_at'),
    admin
      .from('invoice_credit_allocations')
      .select('*')
      .eq('organization_id', orgId)
      .or(`invoice_id.eq.${id},credit_note_id.eq.${id}`)
      .order('allocated_on'),
    admin.from('invoice_customers').select('*').eq('organization_id', orgId).eq('id', doc.customer_id).maybeSingle(),
    doc.kind === 'invoice'
      ? admin
          .from('invoices')
          .select('id, number, status, total, issue_date')
          .eq('organization_id', orgId)
          .eq('credited_invoice_id', id)
          .order('created_at')
      : admin
          .from('invoices')
          .select('id, number, status, total, issue_date')
          .eq('organization_id', orgId)
          .eq('id', doc.credited_invoice_id as string),
    loadSums(admin, orgId, [id]),
  ]);

  const relatedRows = (related.data ?? []) as { id: string; number: string | null; status: InvoiceDocument['status']; total: number; issue_date: string | null }[];
  const numberOf = new Map(relatedRows.map((r) => [r.id, r.number]));
  const summary = summarise(doc as InvoiceDocument, sums, invoiceToday());

  const issuedCredits = doc.kind === 'invoice'
    ? relatedRows.filter((r) => r.status === 'issued').reduce((sum, r) => sum + cents(r.total), 0)
    : 0;

  return {
    ...summary,
    lines: ((lines.data ?? []) as InvoiceLine[]).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      tax_rate: Number(l.tax_rate),
      line_net: Number(l.line_net),
      line_tax: Number(l.line_tax),
    })),
    payments: ((payments.data ?? []) as InvoicePayment[]).map((p) => ({ ...p, amount: Number(p.amount) })),
    allocations: ((allocations.data ?? []) as CreditAllocation[]).map((a) => ({
      ...a,
      amount: Number(a.amount),
      other_number: numberOf.get(a.invoice_id === id ? a.credit_note_id : a.invoice_id) ?? null,
    })),
    customer: (customer.data as InvoiceCustomer | null) ?? null,
    credited_invoice: doc.kind === 'credit_note' && relatedRows[0]
      ? { id: relatedRows[0].id, number: relatedRows[0].number, total: Number(relatedRows[0].total), issue_date: relatedRows[0].issue_date }
      : null,
    credit_notes: doc.kind === 'invoice' ? relatedRows.map((r) => ({ ...r, total: Number(r.total) })) : [],
    creditable_cents: doc.kind === 'invoice' && doc.status === 'issued' ? Math.max(cents(doc.total) - issuedCredits, 0) : 0,
  };
}
