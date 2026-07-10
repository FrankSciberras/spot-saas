'use server';

// =============================================================================
// PARTS & INVENTORY — server actions (create/update/delete parts, log usage)
// =============================================================================
// Same shape as lib/actions/platforms.ts: every action re-checks the session
// role, uses the service-role client, and scopes every statement to the
// caller's organization_id explicitly (the admin client bypasses RLS).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';

type Result = { error?: string; ok?: boolean; id?: string };

export interface PartInput {
  name: string;
  part_number?: string | null;
  category?: string | null;
  quantity?: number;
  min_quantity?: number;
  unit_cost?: number | null;
  supplier?: string | null;
  location?: string | null;
  notes?: string | null;
}

function sanitize(input: PartInput): { error?: string; values?: Record<string, unknown> } {
  const name = (input.name || '').trim();
  if (!name) return { error: 'Part name is required.' };
  if (name.length > 120) return { error: 'Part name is too long.' };

  const quantity = Math.max(0, Math.floor(Number(input.quantity) || 0));
  const minQuantity = Math.max(0, Math.floor(Number(input.min_quantity) || 0));
  const unitCost = input.unit_cost == null || input.unit_cost === ('' as unknown)
    ? null
    : Math.max(0, Math.round(Number(input.unit_cost) * 100) / 100);
  if (unitCost !== null && !Number.isFinite(unitCost)) return { error: 'Unit cost must be a number.' };

  const text = (v: string | null | undefined, max: number) => {
    const t = (v || '').trim();
    return t ? t.slice(0, max) : null;
  };

  return {
    values: {
      name,
      part_number: text(input.part_number, 80),
      category: text(input.category, 60),
      quantity,
      min_quantity: minQuantity,
      unit_cost: unitCost,
      supplier: text(input.supplier, 120),
      location: text(input.location, 120),
      notes: text(input.notes, 500),
    },
  };
}

export async function createPartAction(input: PartInput): Promise<Result> {
  const user = await requireRole(['admin', 'staff']);
  const check = sanitize(input);
  if (check.error) return { error: check.error };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('parts')
    .insert({ ...check.values, organization_id: user.organization_id })
    .select('id')
    .single();
  if (error) {
    console.error('createPartAction:', error);
    return { error: 'Could not create the part. Please try again.' };
  }
  revalidatePath('/fleet/parts');
  return { ok: true, id: (data as { id: string }).id };
}

export async function updatePartAction(id: string, input: PartInput): Promise<Result> {
  const user = await requireRole(['admin', 'staff']);
  const check = sanitize(input);
  if (check.error) return { error: check.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from('parts')
    .update(check.values!)
    .eq('id', id)
    .eq('organization_id', user.organization_id);
  if (error) {
    console.error('updatePartAction:', error);
    return { error: 'Could not update the part. Please try again.' };
  }
  revalidatePath('/fleet/parts');
  return { ok: true, id };
}

export async function deletePartAction(id: string): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();
  const { error } = await admin
    .from('parts')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization_id);
  if (error) {
    console.error('deletePartAction:', error);
    return { error: 'Could not delete the part. Please try again.' };
  }
  revalidatePath('/fleet/parts');
  return { ok: true };
}

/** Add (positive delta) or remove (negative delta) stock without a usage record. */
export async function adjustStockAction(id: string, delta: number): Promise<Result> {
  const user = await requireRole(['admin', 'staff']);
  const change = Math.trunc(Number(delta) || 0);
  if (!change) return { error: 'Enter a quantity to adjust by.' };

  const admin = createAdminClient();
  const { data: part, error: readErr } = await admin
    .from('parts')
    .select('quantity')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();
  if (readErr || !part) return { error: 'Part not found.' };

  const next = Math.max(0, (part as { quantity: number }).quantity + change);
  const { error } = await admin
    .from('parts')
    .update({ quantity: next })
    .eq('id', id)
    .eq('organization_id', user.organization_id);
  if (error) {
    console.error('adjustStockAction:', error);
    return { error: 'Could not adjust the stock. Please try again.' };
  }
  revalidatePath('/fleet/parts');
  return { ok: true };
}

export interface UsageInput {
  part_id: string;
  quantity: number;
  vehicle_id?: string | null;
  service_id?: string | null;
  notes?: string | null;
}

/** Log usage against a vehicle/service and decrement the part's stock. */
export async function recordUsageAction(input: UsageInput): Promise<Result> {
  const user = await requireRole(['admin', 'staff']);
  const qty = Math.floor(Number(input.quantity) || 0);
  if (qty <= 0) return { error: 'Quantity must be at least 1.' };

  const admin = createAdminClient();
  const { data: part, error: readErr } = await admin
    .from('parts')
    .select('id, quantity, unit_cost')
    .eq('id', input.part_id)
    .eq('organization_id', user.organization_id)
    .single();
  if (readErr || !part) return { error: 'Part not found.' };

  const p = part as { id: string; quantity: number; unit_cost: number | null };
  if (qty > p.quantity) return { error: `Only ${p.quantity} in stock.` };

  const { error: usageErr } = await admin.from('part_usage').insert({
    organization_id: user.organization_id,
    part_id: p.id,
    vehicle_id: input.vehicle_id || null,
    service_id: input.service_id || null,
    quantity: qty,
    unit_cost_at_use: p.unit_cost,
    notes: (input.notes || '').trim() || null,
    created_by: user.id,
  });
  if (usageErr) {
    console.error('recordUsageAction usage insert:', usageErr);
    return { error: 'Could not log the usage. Please try again.' };
  }

  const { error: stockErr } = await admin
    .from('parts')
    .update({ quantity: p.quantity - qty })
    .eq('id', p.id)
    .eq('organization_id', user.organization_id);
  if (stockErr) {
    console.error('recordUsageAction stock update:', stockErr);
    return { error: 'Usage logged but the stock count could not be updated — adjust it manually.' };
  }

  revalidatePath('/fleet/parts');
  return { ok: true };
}
