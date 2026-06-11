'use server';

// =============================================================================
// RECURRING ADJUSTMENT ACTIONS (per-fleet auto-applied deductions/bonuses)
// =============================================================================
// A fleet ADMIN defines rules that auto-generate a driver_adjustment on each
// settlement (weekly rent contribution, insurance levy, standing bonus). Every
// action re-checks the admin role via requireRole(['admin']) and writes with
// the service-role client scoped to the caller's organization_id, so a fleet
// can only ever touch its own rules and drivers.
//
// The rules are MATERIALIZED into real driver_adjustments at settlement-create
// time (see app/api/settlements/route.ts) and then frozen like any adjustment;
// editing a rule never re-prices a settlement already created under it.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import type { AdjustmentType, RecurringAmountType } from '@/lib/types/database';

type Result = { error?: string; ok?: boolean; id?: string };

const VALID_TYPES: AdjustmentType[] = ['expense', 'deduction', 'bonus', 'reimbursement', 'other'];

export interface RecurringAdjustmentInput {
  /** NULL/empty = applies to every driver in the fleet. */
  driver_id: string | null;
  type: AdjustmentType;
  amount_type: RecurringAmountType;
  amount: number;
  description: string;
  start_date: string;
  end_date: string | null;
  active: boolean;
}

function sanitize(input: RecurringAdjustmentInput): { error?: string; values?: Record<string, unknown> } {
  const description = (input.description || '').trim();
  if (!description) return { error: 'Give the rule a description.' };
  if (description.length > 120) return { error: 'Description is too long (max 120 characters).' };

  if (!VALID_TYPES.includes(input.type)) return { error: 'Invalid adjustment type.' };

  const amountType: RecurringAmountType = input.amount_type === 'percent_of_gross' ? 'percent_of_gross' : 'fixed';
  const rawAmount = Number(input.amount);
  if (!Number.isFinite(rawAmount) || rawAmount < 0) return { error: 'Enter a valid amount.' };
  if (amountType === 'percent_of_gross' && rawAmount > 100) return { error: 'Percentage cannot exceed 100%.' };

  const startDate = input.start_date || null;
  if (!startDate) return { error: 'Pick a start date.' };
  const endDate = input.end_date || null;
  if (endDate && endDate < startDate) return { error: 'End date cannot be before the start date.' };

  return {
    values: {
      driver_id: input.driver_id || null,
      type: input.type,
      amount_type: amountType,
      amount: Math.round(rawAmount * 100) / 100,
      description,
      start_date: startDate,
      end_date: endDate,
      active: input.active !== false,
    },
  };
}

function revalidateSettlementPages() {
  revalidatePath('/fleet/settlements/settings');
  revalidatePath('/fleet/settlements');
}

/** Verify a driver belongs to the caller's org (when scoping a rule to one). */
async function assertDriverInOrg(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await admin
    .from('drivers')
    .select('id')
    .eq('id', driverId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return !!data;
}

export async function createRecurringAdjustmentAction(input: RecurringAdjustmentInput): Promise<Result> {
  const user = await requireRole(['admin']);

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();

  if (values.driver_id && !(await assertDriverInOrg(admin, values.driver_id as string, user.organization_id))) {
    return { error: 'Driver not found.' };
  }

  const { data, error } = await admin
    .from('recurring_adjustments')
    .insert({ ...values, organization_id: user.organization_id })
    .select('id')
    .single();

  if (error) {
    console.error('createRecurringAdjustmentAction failed:', error);
    return { error: 'Could not create the rule.' };
  }

  revalidateSettlementPages();
  return { ok: true, id: data.id };
}

export async function updateRecurringAdjustmentAction(
  ruleId: string,
  input: RecurringAdjustmentInput
): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!ruleId) return { error: 'Missing rule.' };

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();

  if (values.driver_id && !(await assertDriverInOrg(admin, values.driver_id as string, user.organization_id))) {
    return { error: 'Driver not found.' };
  }

  const { error } = await admin
    .from('recurring_adjustments')
    .update(values)
    .eq('id', ruleId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('updateRecurringAdjustmentAction failed:', error);
    return { error: 'Could not save the rule.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}

/** Pause/resume a rule without deleting it. */
export async function setRecurringAdjustmentActiveAction(ruleId: string, active: boolean): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!ruleId) return { error: 'Missing rule.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('recurring_adjustments')
    .update({ active })
    .eq('id', ruleId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('setRecurringAdjustmentActiveAction failed:', error);
    return { error: 'Could not update the rule.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}

/**
 * Delete a rule. Adjustments it already generated keep their frozen snapshots
 * (FK is ON DELETE SET NULL) — only future settlements stop getting it.
 */
export async function deleteRecurringAdjustmentAction(ruleId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!ruleId) return { error: 'Missing rule.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('recurring_adjustments')
    .delete()
    .eq('id', ruleId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('deleteRecurringAdjustmentAction failed:', error);
    return { error: 'Could not delete the rule.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}
