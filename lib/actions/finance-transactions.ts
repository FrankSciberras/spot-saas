'use server';

// =============================================================================
// FINANCE TRANSACTION ACTIONS — the ledger's write path
// =============================================================================
// "Today I spent €20 on a car wash" becomes one row here, the moment it
// happens, from a phone or a desk. Every action re-checks the admin role
// server-side and writes with the service-role client scoped to the caller's
// ACTIVE organization_id (RLS alone would merge a multi-fleet user's fleets).
//
// Receipts go into the private `documents` bucket under receipts/<org>/<txn>/
// and are only ever served through short-lived signed URLs.
//
// Mirrors lib/actions/vehicle-costs.ts, which did the same for recurring costs.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import type { FinanceTransactionInput, PaymentMethod } from '@/lib/types/database';

type Result = { error?: string; ok?: boolean; id?: string };

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank', 'other'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RECEIPT_BUCKET = 'documents';
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const RECEIPT_EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

function sanitize(input: FinanceTransactionInput): { error?: string; values?: Record<string, unknown> } {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Enter an amount greater than zero.' };
  if (amount > 9_999_999) return { error: 'That amount is too large.' };

  const txnDate = (input.txn_date || '').split('T')[0];
  if (!ISO_DATE.test(txnDate)) return { error: 'Enter a valid date.' };

  if (!input.category_id) return { error: 'Choose a category.' };

  const method: PaymentMethod = PAYMENT_METHODS.includes(input.payment_method as PaymentMethod)
    ? (input.payment_method as PaymentMethod)
    : 'card';

  const description = (input.description || '').trim();
  if (description.length > 200) return { error: 'Description is too long (max 200 characters).' };
  const counterparty = (input.counterparty || '').trim();
  if (counterparty.length > 80) return { error: 'Paid to / received from is too long (max 80 characters).' };

  return {
    values: {
      txn_date: txnDate,
      category_id: input.category_id,
      amount: Math.round(amount * 100) / 100,
      description: description || null,
      counterparty: counterparty || null,
      payment_method: method,
      vehicle_id: input.vehicle_id || null,
      driver_id: input.driver_id || null,
    },
  };
}

function revalidateLedgerPages() {
  revalidatePath('/fleet/earnings');
  revalidatePath('/fleet/financials');
  revalidatePath('/fleet');
}

/**
 * Verify the category and the optional vehicle / driver all belong to the
 * caller's fleet. Foreign keys only prove the rows EXIST — without this an
 * admin could file a line against another fleet's category or car.
 */
async function assertOwnership(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  categoryId: string,
  vehicleId: string | null,
  driverId: string | null,
): Promise<string | null> {
  const { data: category } = await admin
    .from('org_finance_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!category) return 'That category does not belong to this fleet.';

  if (vehicleId) {
    const { data: vehicle } = await admin
      .from('vehicles')
      .select('id')
      .eq('id', vehicleId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!vehicle) return 'That vehicle does not belong to this fleet.';
  }

  if (driverId) {
    const { data: driver } = await admin
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!driver) return 'That driver does not belong to this fleet.';
  }

  return null;
}

/** Record a transaction. */
export async function createTransactionAction(input: FinanceTransactionInput): Promise<Result> {
  const user = await requireRole(['admin']);

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();
  const ownErr = await assertOwnership(
    admin,
    user.organization_id,
    values.category_id as string,
    values.vehicle_id as string | null,
    values.driver_id as string | null,
  );
  if (ownErr) return { error: ownErr };

  const { data, error } = await admin
    .from('finance_transactions')
    .insert({ ...values, organization_id: user.organization_id, source: 'manual', created_by: user.id })
    .select('id')
    .single();

  if (error) {
    console.error('createTransactionAction failed:', error);
    return { error: 'Could not save the transaction.' };
  }

  revalidateLedgerPages();
  return { ok: true, id: data.id };
}

/** Edit a transaction. Generated lines (recurring / imported) can be edited too — they are just rows. */
export async function updateTransactionAction(id: string, input: FinanceTransactionInput): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!id) return { error: 'Missing transaction.' };

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();
  const ownErr = await assertOwnership(
    admin,
    user.organization_id,
    values.category_id as string,
    values.vehicle_id as string | null,
    values.driver_id as string | null,
  );
  if (ownErr) return { error: ownErr };

  const { error } = await admin
    .from('finance_transactions')
    .update(values)
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('updateTransactionAction failed:', error);
    return { error: 'Could not save the transaction.' };
  }

  revalidateLedgerPages();
  return { ok: true };
}

/** Delete a transaction and its receipt object, if any. */
export async function deleteTransactionAction(id: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!id) return { error: 'Missing transaction.' };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('finance_transactions')
    .select('id, receipt_path')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .maybeSingle();
  if (!existing) return { error: 'Transaction not found.' };

  const { error } = await admin
    .from('finance_transactions')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('deleteTransactionAction failed:', error);
    return { error: 'Could not delete the transaction.' };
  }

  if (existing.receipt_path) {
    await admin.storage.from(RECEIPT_BUCKET).remove([existing.receipt_path]);
  }

  revalidateLedgerPages();
  return { ok: true };
}

/**
 * Attach a receipt photo / PDF to a transaction (replacing any existing one).
 * FormData with a single `file` field — that is what a phone's camera input
 * hands us, so no client-side conversion is needed.
 */
export async function uploadReceiptAction(id: string, formData: FormData): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!id) return { error: 'Missing transaction.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo or PDF first.' };

  // Extension from the MIME type, never the client-supplied filename.
  const ext = RECEIPT_EXT_BY_TYPE[file.type];
  if (!ext) return { error: 'Receipts can be a JPG, PNG, WEBP, HEIC photo or a PDF.' };
  if (file.size > RECEIPT_MAX_BYTES) return { error: 'That file is over 10MB.' };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('finance_transactions')
    .select('id, receipt_path')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .maybeSingle();
  if (!existing) return { error: 'Transaction not found.' };

  const path = `receipts/${user.organization_id}/${id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from(RECEIPT_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: '3600' });
  if (upErr) {
    console.error('uploadReceiptAction storage failed:', upErr);
    return { error: 'Could not upload the receipt.' };
  }

  const { error: dbErr } = await admin
    .from('finance_transactions')
    .update({ receipt_path: path })
    .eq('id', id)
    .eq('organization_id', user.organization_id);
  if (dbErr) {
    await admin.storage.from(RECEIPT_BUCKET).remove([path]);
    console.error('uploadReceiptAction db failed:', dbErr);
    return { error: 'Could not attach the receipt.' };
  }

  if (existing.receipt_path && existing.receipt_path !== path) {
    await admin.storage.from(RECEIPT_BUCKET).remove([existing.receipt_path]);
  }

  revalidateLedgerPages();
  return { ok: true };
}

/** Detach and delete a transaction's receipt. */
export async function removeReceiptAction(id: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!id) return { error: 'Missing transaction.' };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('finance_transactions')
    .select('id, receipt_path')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .maybeSingle();
  if (!existing) return { error: 'Transaction not found.' };

  const { error } = await admin
    .from('finance_transactions')
    .update({ receipt_path: null })
    .eq('id', id)
    .eq('organization_id', user.organization_id);
  if (error) return { error: 'Could not remove the receipt.' };

  if (existing.receipt_path) {
    await admin.storage.from(RECEIPT_BUCKET).remove([existing.receipt_path]);
  }

  revalidateLedgerPages();
  return { ok: true };
}

/**
 * A 5-minute signed URL to view a receipt. The ownership check happens here,
 * on the transaction row, before the service role signs anything.
 */
export async function getReceiptUrlAction(id: string): Promise<{ url?: string; error?: string }> {
  const user = await requireRole(['admin']);
  if (!id) return { error: 'Missing transaction.' };

  const admin = createAdminClient();
  const { data: txn } = await admin
    .from('finance_transactions')
    .select('receipt_path')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .maybeSingle();
  if (!txn?.receipt_path) return { error: 'No receipt attached.' };

  const { data, error } = await admin.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(txn.receipt_path, 300);
  if (error || !data?.signedUrl) return { error: 'Could not open the receipt.' };

  return { url: data.signedUrl };
}
