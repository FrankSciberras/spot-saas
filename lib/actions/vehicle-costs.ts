'use server';

// =============================================================================
// VEHICLE RECURRING COST ACTIONS
// =============================================================================
// What a vehicle costs the FLEET to run: lease or finance payment, road tax,
// insurance premium, tracker subscription. Nothing in the schema could express
// this before — `vehicles` carries expiry DATES but no amounts, and the only
// "rent" in the system is rent charged TO a driver (settlement_presets.
// rent_weekly), which is income, not cost. For a leasing fleet this is usually
// the single largest expense line, and it previously had to be typed into
// "Other" every single period.
//
// A cost with vehicle_id NULL is a fleet-wide overhead (yard rent, fleet
// insurance) rather than one car's.
//
// These rows are a TEMPLATE, not a ledger: creating a bookkeeping period
// prorates whatever was live during it into that period's entries, which the
// operator can then override. See lib/utils/bookkeepingPeriods.ts#prorateCost.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import type { CostFrequency } from '@/lib/utils/bookkeepingPeriods';

type Result = { error?: string; ok?: boolean; id?: string };

export interface VehicleCostInput {
  vehicle_id?: string | null;
  category_id: string;
  label: string;
  amount: number;
  frequency: CostFrequency;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
}

const FREQUENCIES: CostFrequency[] = ['weekly', 'monthly', 'yearly'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(input: VehicleCostInput): { error?: string; values?: Record<string, unknown> } {
  const label = (input.label || '').trim();
  if (!label) return { error: 'Give the cost a name, e.g. "Lease — VW Passat".' };
  if (label.length > 60) return { error: 'Name is too long (max 60 characters).' };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: 'Enter a valid amount.' };
  }
  if (amount > 9_999_999) return { error: 'That amount is too large.' };

  if (!FREQUENCIES.includes(input.frequency)) {
    return { error: 'Choose weekly, monthly or yearly.' };
  }

  const startDate = (input.start_date || '').split('T')[0];
  if (!ISO_DATE.test(startDate)) return { error: 'Enter a valid start date.' };

  const endDate = input.end_date ? input.end_date.split('T')[0] : null;
  if (endDate && !ISO_DATE.test(endDate)) return { error: 'Enter a valid end date.' };
  if (endDate && endDate < startDate) return { error: 'The end date is before the start date.' };

  if (!input.category_id) return { error: 'Choose which category this books to.' };

  return {
    values: {
      label,
      amount: Math.round(amount * 100) / 100,
      frequency: input.frequency,
      start_date: startDate,
      end_date: endDate,
      notes: (input.notes || '').trim() || null,
      vehicle_id: input.vehicle_id || null,
      category_id: input.category_id,
    },
  };
}

function revalidateCostPages() {
  revalidatePath('/fleet/earnings');
  revalidatePath('/fleet/financials');
  revalidatePath('/fleet/vehicles');
}

/**
 * Verify a category and (optional) vehicle belong to the caller's fleet.
 *
 * The foreign keys only prove these rows EXIST — without this check an admin
 * could attach another fleet's vehicle or category id to their own cost.
 */
async function assertOwnership(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  categoryId: string,
  vehicleId: string | null,
): Promise<string | null> {
  const { data: category } = await admin
    .from('org_finance_categories')
    .select('id, kind')
    .eq('id', categoryId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!category) return 'That category does not belong to this fleet.';
  if (category.kind !== 'expense') {
    return 'Vehicle running costs must book to an expense category.';
  }

  if (vehicleId) {
    const { data: vehicle } = await admin
      .from('vehicles')
      .select('id')
      .eq('id', vehicleId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!vehicle) return 'That vehicle does not belong to this fleet.';
  }

  return null;
}

/** Add a recurring cost. */
export async function createVehicleCostAction(input: VehicleCostInput): Promise<Result> {
  const user = await requireRole(['admin']);

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();

  const ownErr = await assertOwnership(
    admin,
    user.organization_id,
    values.category_id as string,
    values.vehicle_id as string | null,
  );
  if (ownErr) return { error: ownErr };

  const { data, error } = await admin
    .from('vehicle_recurring_costs')
    .insert({ ...values, organization_id: user.organization_id })
    .select('id')
    .single();

  if (error) {
    console.error('createVehicleCostAction failed:', error);
    return { error: 'Could not add the cost.' };
  }

  revalidateCostPages();
  return { ok: true, id: data.id };
}

/** Edit a recurring cost. Periods already saved keep the figures they captured. */
export async function updateVehicleCostAction(
  costId: string,
  input: VehicleCostInput,
): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!costId) return { error: 'Missing cost.' };

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();

  const ownErr = await assertOwnership(
    admin,
    user.organization_id,
    values.category_id as string,
    values.vehicle_id as string | null,
  );
  if (ownErr) return { error: ownErr };

  const { error } = await admin
    .from('vehicle_recurring_costs')
    .update(values)
    .eq('id', costId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('updateVehicleCostAction failed:', error);
    return { error: 'Could not save the cost.' };
  }

  revalidateCostPages();
  return { ok: true };
}

/** Pause/resume a cost without losing its history or settings. */
export async function setVehicleCostActiveAction(
  costId: string,
  isActive: boolean,
): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!costId) return { error: 'Missing cost.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('vehicle_recurring_costs')
    .update({ is_active: isActive })
    .eq('id', costId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('setVehicleCostActiveAction failed:', error);
    return { error: 'Could not update the cost.' };
  }

  revalidateCostPages();
  return { ok: true };
}

/**
 * Delete a recurring cost. Safe: it is only a template for future periods —
 * amounts already written into a period stay exactly as they were.
 */
export async function deleteVehicleCostAction(costId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!costId) return { error: 'Missing cost.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('vehicle_recurring_costs')
    .delete()
    .eq('id', costId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('deleteVehicleCostAction failed:', error);
    return { error: 'Could not delete the cost.' };
  }

  revalidateCostPages();
  return { ok: true };
}
