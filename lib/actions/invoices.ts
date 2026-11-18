'use server';

// =============================================================================
// INVOICE ACTIONS (fleet admin only)
// =============================================================================
// Customers, drafts, issuing, voiding, payments, credit notes and settings.
// Every action re-checks the ADMIN role for the caller's ACTIVE fleet and then
// works with the service-role client scoped to that organization_id — the
// invoice tables have no client-side access at all (20261118_invoices.sql).
//
// The rules that matter (numbering, freezing, balances, credit limits) are
// enforced by the database functions; these actions validate input, call them,
// and turn their messages into something to show.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { getFleetSettings } from '@/lib/settings/server';
import { fromCents, lineAmounts, documentTotals, toCents, toScaled } from '@/lib/invoices/math';
import { ensureInvoiceSettings, getDocument, invoiceErrorMessage, invoiceToday } from '@/lib/invoices/server';
import {
  INVOICE_LIMITS,
  type ActionResult,
  type CustomerInput,
  type DraftInput,
  type InvoiceSettingsInput,
  type PaymentMethod,
} from '@/lib/invoices/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS: PaymentMethod[] = ['cash', 'card', 'bank', 'other'];

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function refresh(id?: string) {
  revalidatePath('/fleet/invoices');
  if (id) revalidatePath(`/fleet/invoices/${id}`);
}

async function audit(
  userId: string,
  orgId: string,
  action: 'create' | 'update' | 'delete',
  entityType: string,
  entityId: string,
  summary: string,
  details?: Record<string, unknown>,
) {
  try {
    await createAuditLogEntry({ actor: await getAuditActor(userId), organizationId: orgId, action, entityType, entityId, summary, details });
  } catch (error) {
    // An audit failure must never undo or hide a completed money action.
    console.error('invoices: audit log failed:', error);
  }
}

// -----------------------------------------------------------------------------
// Customers
// -----------------------------------------------------------------------------

export async function saveCustomerAction(input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;

  const name = clean(input.name, 200);
  if (!name) return { ok: false, error: 'Enter the customer’s name.' };
  const email = clean(input.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That email address doesn’t look right.' };
  }

  const values = {
    name,
    contact_name: clean(input.contact_name, 200),
    email,
    phone: clean(input.phone, 60),
    address: clean(input.address, 600),
    vat_number: clean(input.vat_number, 40),
    notes: clean(input.notes, 2000),
  };

  const admin = createAdminClient();
  if (input.id) {
    if (!UUID.test(input.id)) return { ok: false, error: 'That customer no longer exists.' };
    const { data, error } = await admin
      .from('invoice_customers')
      .update(values)
      .eq('organization_id', orgId)
      .eq('id', input.id)
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: invoiceErrorMessage(error) };
    if (!data) return { ok: false, error: 'That customer no longer exists.' };
    await audit(user.id, orgId, 'update', 'invoice_customer', data.id, `Updated customer ${name}`);
    refresh();
    return { ok: true, id: data.id as string };
  }

  const { data, error } = await admin
    .from('invoice_customers')
    .insert({ ...values, organization_id: orgId, created_by: user.id })
    .select('id')
    .single();
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  await audit(user.id, orgId, 'create', 'invoice_customer', data.id, `Added customer ${name}`);
  refresh();
  return { ok: true, id: data.id as string };
}

/** Archive hides a customer from pickers; their documents are untouched. */
export async function setCustomerArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const user = await requireRole(['admin']);
  if (!UUID.test(id)) return { ok: false, error: 'That customer no longer exists.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('invoice_customers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('organization_id', user.organization_id)
    .eq('id', id)
    .select('id, name')
    .maybeSingle();
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  if (!data) return { ok: false, error: 'That customer no longer exists.' };
  await audit(user.id, user.organization_id, 'update', 'invoice_customer', id, `${archived ? 'Archived' : 'Restored'} customer ${data.name}`);
  refresh();
  return { ok: true };
}

/** Only a customer with no documents at all can be deleted outright. */
export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  const user = await requireRole(['admin']);
  if (!UUID.test(id)) return { ok: false, error: 'That customer no longer exists.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('invoice_customers')
    .delete()
    .eq('organization_id', user.organization_id)
    .eq('id', id)
    .select('id, name')
    .maybeSingle();
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  if (!data) return { ok: false, error: 'That customer no longer exists.' };
  await audit(user.id, user.organization_id, 'delete', 'invoice_customer', id, `Deleted customer ${data.name}`);
  refresh();
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Drafts
// -----------------------------------------------------------------------------

interface CleanLine {
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_net: number;
  line_tax: number;
}

function validateLines(lines: DraftInput['lines']): { lines: CleanLine[] } | { error: string } {
  if (!Array.isArray(lines)) return { error: 'Add at least one line.' };
  // A row left completely empty at the bottom of the editor is not a line.
  const typed = lines.filter((l) => l && (String(l.description ?? '').trim() || String(l.unit_price ?? '').trim()));
  if (typed.length > INVOICE_LIMITS.maxLines) return { error: `A document can have at most ${INVOICE_LIMITS.maxLines} lines.` };

  const out: CleanLine[] = [];
  for (const [index, line] of typed.entries()) {
    const n = index + 1;
    const description = clean(line.description, INVOICE_LIMITS.maxDescription);
    if (!description) return { error: `Line ${n}: add a description.` };
    const qty = toScaled(line.quantity, 3);
    if (qty === null || qty <= BigInt(0)) return { error: `Line ${n}: the quantity must be more than zero.` };
    const price = toScaled(line.unit_price, 2);
    if (price === null) return { error: `Line ${n}: enter a price.` };
    const rate = toScaled(line.tax_rate, 2);
    if (rate === null || rate < BigInt(0) || rate > BigInt(10000)) return { error: `Line ${n}: the VAT rate must be between 0 and 100.` };
    const amounts = lineAmounts({ quantity: line.quantity, unitPrice: line.unit_price, taxRate: line.tax_rate });
    if (!amounts || Math.abs(amounts.gross) > INVOICE_LIMITS.maxAmountCents) return { error: `Line ${n}: that amount is too large.` };
    out.push({
      position: index,
      description,
      quantity: Number(qty) / 1000,
      unit_price: Number(price) / 100,
      tax_rate: Number(rate) / 100,
      line_net: fromCents(amounts.net),
      line_tax: fromCents(amounts.tax),
    });
  }
  return { lines: out };
}

/**
 * Creates or updates a DRAFT. Lines are replaced as a set. Nothing here gives
 * the document a number — that only happens in issueDocumentAction.
 */
export async function saveDraftAction(input: DraftInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const kind = input.kind === 'credit_note' ? 'credit_note' : 'invoice';
  if (!input.customer_id || !UUID.test(input.customer_id)) return { ok: false, error: 'Choose a customer.' };
  if (input.issue_date && !validDate(input.issue_date)) return { ok: false, error: 'That issue date isn’t a valid date.' };
  if (input.due_date && !validDate(input.due_date)) return { ok: false, error: 'That due date isn’t a valid date.' };
  if (input.issue_date && input.due_date && input.due_date < input.issue_date) {
    return { ok: false, error: 'The due date can’t be before the issue date.' };
  }

  const checked = validateLines(input.lines);
  if ('error' in checked) return { ok: false, error: checked.error };
  const totals = documentTotals(checked.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price, taxRate: l.tax_rate })));
  if (Math.abs(totals.total) > INVOICE_LIMITS.maxAmountCents) return { ok: false, error: 'That total is too large.' };

  const { data: customer, error: customerError } = await admin
    .from('invoice_customers')
    .select('id')
    .eq('organization_id', orgId)
    .eq('id', input.customer_id)
    .maybeSingle();
  if (customerError) return { ok: false, error: invoiceErrorMessage(customerError) };
  if (!customer) return { ok: false, error: 'That customer no longer exists.' };

  let creditedId: string | null = null;
  if (kind === 'credit_note') {
    if (!input.credited_invoice_id || !UUID.test(input.credited_invoice_id)) {
      return { ok: false, error: 'A credit note has to be raised against an invoice.' };
    }
    const { data: original } = await admin
      .from('invoices')
      .select('id, kind, status, customer_id')
      .eq('organization_id', orgId)
      .eq('id', input.credited_invoice_id)
      .maybeSingle();
    if (!original || original.kind !== 'invoice' || original.status !== 'issued') {
      return { ok: false, error: 'A credit note can only be raised against an issued invoice.' };
    }
    if (original.customer_id !== input.customer_id) {
      return { ok: false, error: 'A credit note must be for the same customer as its invoice.' };
    }
    creditedId = original.id as string;
  }

  const fleet = await getFleetSettings(orgId);
  const header = {
    kind,
    customer_id: input.customer_id,
    credited_invoice_id: creditedId,
    credit_reason: kind === 'credit_note' ? clean(input.credit_reason, 500) : null,
    issue_date: input.issue_date || null,
    due_date: kind === 'invoice' ? input.due_date || null : null,
    currency: fleet['finance.currency'],
    reference: clean(input.reference, 120),
    notes: clean(input.notes, 2000),
    subtotal: fromCents(totals.subtotal),
    tax_total: fromCents(totals.tax),
    total: fromCents(totals.total),
  };

  let id = input.id ?? null;
  if (id) {
    if (!UUID.test(id)) return { ok: false, error: 'That draft no longer exists.' };
    const { data, error } = await admin
      .from('invoices')
      .update(header)
      .eq('organization_id', orgId)
      .eq('id', id)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (error) return { ok: false, error: invoiceErrorMessage(error) };
    if (!data) return { ok: false, error: 'This document has already been issued and can’t be edited.' };
  } else {
    const { data, error } = await admin
      .from('invoices')
      .insert({ ...header, organization_id: orgId, created_by: user.id })
      .select('id')
      .single();
    if (error) return { ok: false, error: invoiceErrorMessage(error) };
    id = data.id as string;
  }

  // Replace the lines. If the insert fails the draft is left with no lines,
  // which can't be issued — never with a half-saved mix of old and new.
  const { error: clearError } = await admin.from('invoice_lines').delete().eq('organization_id', orgId).eq('invoice_id', id);
  if (clearError) return { ok: false, error: invoiceErrorMessage(clearError) };
  if (checked.lines.length > 0) {
    const { error: linesError } = await admin
      .from('invoice_lines')
      .insert(checked.lines.map((l) => ({ ...l, organization_id: orgId, invoice_id: id })));
    if (linesError) return { ok: false, error: invoiceErrorMessage(linesError, 'The lines could not be saved. Please try again.') };
  }

  refresh(id);
  return { ok: true, id };
}

export async function deleteDraftAction(id: string): Promise<ActionResult> {
  const user = await requireRole(['admin']);
  if (!UUID.test(id)) return { ok: false, error: 'That draft no longer exists.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('invoices')
    .delete()
    .eq('organization_id', user.organization_id)
    .eq('id', id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  if (!data) return { ok: false, error: 'Only a draft can be deleted. Void an issued document instead.' };
  refresh();
  return { ok: true };
}

/**
 * Starts a credit note for an issued invoice. 'full' copies whatever can still
 * be credited as the invoice's own lines; 'blank' starts with one empty line.
 * If a draft credit note for the invoice already exists, that one is returned.
 */
export async function startCreditNoteAction(invoiceId: string, mode: 'full' | 'blank' = 'full'): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  if (!UUID.test(invoiceId)) return { ok: false, error: 'That invoice no longer exists.' };
  const admin = createAdminClient();

  const invoice = await getDocument(admin, orgId, invoiceId);
  if (!invoice || invoice.kind !== 'invoice') return { ok: false, error: 'That invoice no longer exists.' };
  if (invoice.status !== 'issued') return { ok: false, error: 'Only an issued invoice can be credited.' };
  if (invoice.creditable_cents <= 0) return { ok: false, error: 'This invoice has already been credited in full.' };

  const existing = invoice.credit_notes.find((c) => c.status === 'draft');
  if (existing) return { ok: true, id: existing.id };

  // Copy the lines only when the whole invoice can still be credited —
  // otherwise the copy would exceed what is left and could not be issued.
  const copyLines = mode === 'full' && invoice.creditable_cents === (toCents(invoice.total) ?? 0);
  const lines = copyLines
    ? invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate }))
    : [];

  return saveDraftAction({
    kind: 'credit_note',
    customer_id: invoice.customer_id,
    credited_invoice_id: invoice.id,
    credit_reason: null,
    issue_date: null,
    reference: invoice.number,
    lines,
  });
}

// -----------------------------------------------------------------------------
// Issue / void
// -----------------------------------------------------------------------------

export async function issueDocumentAction(id: string, issueDate?: string | null): Promise<ActionResult<{ number: string }>> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  if (!UUID.test(id)) return { ok: false, error: 'That document no longer exists.' };
  if (issueDate && !validDate(issueDate)) return { ok: false, error: 'That issue date isn’t a valid date.' };

  const admin = createAdminClient();
  // Make sure the settings row (prefixes, counters, bookkeeping category) exists.
  const { error: settingsError } = await ensureInvoiceSettings(admin, orgId);
  if (settingsError) return { ok: false, error: settingsError };

  const { data, error } = await admin.rpc('invoice_issue', {
    p_org: orgId,
    p_invoice: id,
    p_user: user.id,
    p_issue_date: issueDate || invoiceToday(),
  });
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  const issued = (Array.isArray(data) ? data[0] : data) as { number: string; kind: string; total: number; customer_name: string } | null;
  if (!issued?.number) return { ok: false, error: 'The document could not be issued. Please try again.' };

  await audit(
    user.id,
    orgId,
    'create',
    issued.kind === 'credit_note' ? 'credit_note' : 'invoice',
    id,
    `Issued ${issued.kind === 'credit_note' ? 'credit note' : 'invoice'} ${issued.number} to ${issued.customer_name}`,
    { number: issued.number, total: issued.total },
  );
  refresh(id);
  return { ok: true, number: issued.number };
}

export async function voidDocumentAction(id: string, reason?: string | null): Promise<ActionResult> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  if (!UUID.test(id)) return { ok: false, error: 'That document no longer exists.' };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('invoice_void', {
    p_org: orgId,
    p_invoice: id,
    p_user: user.id,
    p_reason: clean(reason, 500),
  });
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  const voided = (Array.isArray(data) ? data[0] : data) as { number: string; kind: string } | null;
  await audit(user.id, orgId, 'update', voided?.kind === 'credit_note' ? 'credit_note' : 'invoice', id, `Voided ${voided?.number ?? 'a document'}`, {
    reason: clean(reason, 500),
  });
  refresh(id);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Payments and refunds
// -----------------------------------------------------------------------------

export async function recordPaymentAction(input: {
  invoiceId: string;
  amount: string | number;
  paidOn: string;
  method: PaymentMethod;
  reference?: string | null;
}): Promise<ActionResult<{ paymentId: string }>> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  if (!UUID.test(input.invoiceId)) return { ok: false, error: 'That document no longer exists.' };
  const cents = toCents(input.amount);
  if (cents === null || cents <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };
  if (cents > INVOICE_LIMITS.maxAmountCents) return { ok: false, error: 'That amount is too large.' };
  if (!validDate(input.paidOn)) return { ok: false, error: 'Enter the date of the payment.' };
  if (!METHODS.includes(input.method)) return { ok: false, error: 'Choose how it was paid.' };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('invoice_record_payment', {
    p_org: orgId,
    p_invoice: input.invoiceId,
    p_amount: fromCents(cents),
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_reference: clean(input.reference, 120),
    p_user: user.id,
  });
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  const payment = (Array.isArray(data) ? data[0] : data) as { id: string } | null;
  if (!payment?.id) return { ok: false, error: 'The payment could not be recorded. Please try again.' };

  await audit(user.id, orgId, 'create', 'invoice_payment', payment.id, `Recorded a payment of ${fromCents(cents).toFixed(2)}`, {
    invoice_id: input.invoiceId,
    paid_on: input.paidOn,
    method: input.method,
  });
  refresh(input.invoiceId);
  revalidatePath('/fleet/earnings');
  return { ok: true, paymentId: payment.id };
}

export async function deletePaymentAction(paymentId: string): Promise<ActionResult> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  if (!UUID.test(paymentId)) return { ok: false, error: 'That payment no longer exists.' };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('invoice_delete_payment', { p_org: orgId, p_payment: paymentId });
  if (error) return { ok: false, error: invoiceErrorMessage(error) };
  const payment = (Array.isArray(data) ? data[0] : data) as { invoice_id: string; amount: number } | null;
  await audit(user.id, orgId, 'delete', 'invoice_payment', paymentId, `Removed a payment of ${Number(payment?.amount ?? 0).toFixed(2)}`, {
    invoice_id: payment?.invoice_id,
  });
  refresh(payment?.invoice_id);
  revalidatePath('/fleet/earnings');
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------

export async function saveInvoiceSettingsAction(input: InvoiceSettingsInput): Promise<ActionResult> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const prefixOk = (p: unknown): p is string => typeof p === 'string' && /^[A-Za-z0-9/_.-]{0,12}$/.test(p);
  if (!prefixOk(input.invoice_prefix) || !prefixOk(input.credit_note_prefix)) {
    return { ok: false, error: 'A prefix can use letters, numbers and - _ . / only, up to 12 characters.' };
  }
  const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
  if (!int(input.number_padding, 1, 10)) return { ok: false, error: 'Digits in a number must be between 1 and 10.' };
  if (!int(input.payment_terms_days, 0, 365)) return { ok: false, error: 'Payment terms must be between 0 and 365 days.' };
  if (!int(input.next_invoice_number, 1, 2_000_000_000) || !int(input.next_credit_note_number, 1, 2_000_000_000)) {
    return { ok: false, error: 'The next number must be a whole number, 1 or more.' };
  }
  const rate = toScaled(input.default_tax_rate, 2);
  if (rate === null || rate < BigInt(0) || rate > BigInt(10000)) return { ok: false, error: 'The VAT rate must be between 0 and 100.' };

  const { settings, error: settingsError } = await ensureInvoiceSettings(admin, orgId);
  if (!settings) return { ok: false, error: settingsError ?? 'Settings could not be loaded.' };

  // A counter may only move forward, and never onto a number already used:
  // going back would hand out a number twice.
  const { data: used } = await admin
    .from('invoices')
    .select('kind, number_seq')
    .eq('organization_id', orgId)
    .not('number_seq', 'is', null)
    .order('number_seq', { ascending: false })
    .limit(2000);
  const maxSeq = (kind: string) => Math.max(0, ...(used ?? []).filter((r) => r.kind === kind).map((r) => Number(r.number_seq)));
  if (input.next_invoice_number <= maxSeq('invoice')) {
    return { ok: false, error: `The next invoice number must be higher than ${maxSeq('invoice')}, the last one you issued.` };
  }
  if (input.next_credit_note_number <= maxSeq('credit_note')) {
    return { ok: false, error: `The next credit note number must be higher than ${maxSeq('credit_note')}, the last one you issued.` };
  }

  // A category must belong to this fleet and be of the right kind.
  const categoryIds = [input.income_category_id, input.refund_category_id].filter((v): v is string => Boolean(v));
  if (categoryIds.some((v) => !UUID.test(v))) return { ok: false, error: 'That bookkeeping category no longer exists.' };
  if (categoryIds.length > 0) {
    const { data: categories } = await admin
      .from('org_finance_categories')
      .select('id, kind')
      .eq('organization_id', orgId)
      .in('id', categoryIds);
    const kindOf = new Map((categories ?? []).map((c) => [c.id as string, c.kind as string]));
    if (input.income_category_id && kindOf.get(input.income_category_id) !== 'income') {
      return { ok: false, error: 'Payments must be posted to an income category.' };
    }
    if (input.refund_category_id && kindOf.get(input.refund_category_id) !== 'expense') {
      return { ok: false, error: 'Refunds must be posted to an expense category.' };
    }
  }

  const { error } = await admin
    .from('invoice_settings')
    .update({
      invoice_prefix: input.invoice_prefix,
      credit_note_prefix: input.credit_note_prefix,
      next_invoice_number: input.next_invoice_number,
      next_credit_note_number: input.next_credit_note_number,
      number_padding: input.number_padding,
      default_tax_rate: Number(rate) / 100,
      payment_terms_days: input.payment_terms_days,
      payment_instructions: clean(input.payment_instructions, 1000),
      footer_note: clean(input.footer_note, 1000),
      record_payments_in_books: Boolean(input.record_payments_in_books),
      income_category_id: input.income_category_id || null,
      refund_category_id: input.refund_category_id || null,
    })
    .eq('organization_id', orgId);
  if (error) return { ok: false, error: invoiceErrorMessage(error) };

  await audit(user.id, orgId, 'update', 'invoice_settings', orgId, 'Updated invoice settings');
  refresh();
  return { ok: true };
}
