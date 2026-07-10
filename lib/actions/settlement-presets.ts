'use server';

// =============================================================================
// SETTLEMENT PRESET ACTIONS (named per-fleet settlement schemes)
// =============================================================================
// A fleet ADMIN manages a small set of named presets (revenue split + tax +
// weekly rent), picks one as the fleet default, and assigns presets to
// individual drivers. Every action re-checks the admin role server-side via
// requireRole(['admin']) (which also resolves the caller's organization_id),
// then writes with the service-role client scoped to that exact org id — so a
// fleet can only ever touch its own presets and drivers.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { clampPercent, COMPONENT_KEYS, DEFAULT_SCHEME } from '@/lib/config/settlements';
import type { SettlementTaxType } from '@/lib/types/database';

type Result = { error?: string; ok?: boolean; id?: string };

export interface PresetInput {
  name: string;
  driver_share_pct: number;
  tips_driver_pct: number;
  campaigns_driver_pct: number;
  fee_driver_pct: number;
  tax_type: SettlementTaxType;
  tax_value: number;
  rent_weekly: number;
  /** Wage fields + component toggles. Optional: omitted = classic revenue split. */
  hourly_rate?: number;
  fixed_wage_weekly?: number;
  components?: Record<string, boolean>;
}

/** Non-negative EUR amount, defaulting to 0 for anything unparseable. */
function safeAmount(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function sanitizePreset(input: PresetInput): { error?: string; values?: Record<string, unknown> } {
  const name = (input.name || '').trim();
  if (!name) return { error: 'Give the preset a name.' };
  if (name.length > 60) return { error: 'Preset name is too long (max 60 characters).' };

  const taxType: SettlementTaxType = input.tax_type === 'percent' ? 'percent' : 'flat';
  const taxValue =
    taxType === 'percent' ? clampPercent(input.tax_value, 0) : safeAmount(input.tax_value);
  const rent = safeAmount(input.rent_weekly);

  // Component toggles: keep only known keys with real booleans. undefined =
  // leave whatever the row already has (create inserts the '{}' column default).
  let components: Record<string, boolean> | undefined;
  if (input.components && typeof input.components === 'object') {
    components = {};
    for (const key of COMPONENT_KEYS) {
      const v = input.components[key];
      if (typeof v === 'boolean') components[key] = v;
    }
  }

  return {
    values: {
      name,
      driver_share_pct: clampPercent(input.driver_share_pct, DEFAULT_SCHEME.driverSharePct),
      tips_driver_pct: clampPercent(input.tips_driver_pct, DEFAULT_SCHEME.tipsDriverPct),
      campaigns_driver_pct: clampPercent(input.campaigns_driver_pct, DEFAULT_SCHEME.campaignsDriverPct),
      fee_driver_pct: clampPercent(input.fee_driver_pct, DEFAULT_SCHEME.feeDriverPct),
      tax_type: taxType,
      tax_value: taxValue,
      rent_weekly: rent,
      // Only touch wage fields the caller actually sent, so legacy callers
      // (e.g. the setup wizard) can't zero out a preset's rates on update.
      ...(input.hourly_rate !== undefined ? { hourly_rate: safeAmount(input.hourly_rate) } : {}),
      ...(input.fixed_wage_weekly !== undefined
        ? { fixed_wage_weekly: safeAmount(input.fixed_wage_weekly) }
        : {}),
      ...(components ? { components } : {}),
    },
  };
}

function revalidateSettlementPages() {
  revalidatePath('/fleet/settlements/settings');
  revalidatePath('/fleet/settlements');
}

/** Create a preset. Returns the new preset's id. */
export async function createPresetAction(input: PresetInput): Promise<Result> {
  const user = await requireRole(['admin']);

  const { error: vErr, values } = sanitizePreset(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('settlement_presets')
    .insert({ ...values, organization_id: user.organization_id })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'A preset with that name already exists.' };
    console.error('createPresetAction failed:', error);
    return { error: 'Could not create the preset.' };
  }

  revalidateSettlementPages();
  return { ok: true, id: data.id };
}

/** Update a preset. Settlements already saved keep their frozen snapshot. */
export async function updatePresetAction(presetId: string, input: PresetInput): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!presetId) return { error: 'Missing preset.' };

  const { error: vErr, values } = sanitizePreset(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();
  const { error } = await admin
    .from('settlement_presets')
    .update(values)
    .eq('id', presetId)
    .eq('organization_id', user.organization_id);

  if (error) {
    if (error.code === '23505') return { error: 'A preset with that name already exists.' };
    console.error('updatePresetAction failed:', error);
    return { error: 'Could not save the preset.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}

/**
 * Delete a preset. FK columns are ON DELETE SET NULL, so any assigned drivers
 * (and the org default, if it pointed here) gracefully fall back. Existing
 * settlements are untouched — they carry frozen snapshots.
 */
export async function deletePresetAction(presetId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!presetId) return { error: 'Missing preset.' };

  const admin = createAdminClient();

  // Don't allow deleting the last preset: the fleet always needs at least one.
  const { count } = await admin
    .from('settlement_presets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', user.organization_id);
  if ((count ?? 0) <= 1) {
    return { error: 'You need at least one preset. Create another before deleting this one.' };
  }

  const { error } = await admin
    .from('settlement_presets')
    .delete()
    .eq('id', presetId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('deletePresetAction failed:', error);
    return { error: 'Could not delete the preset.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}

/** Set the fleet's default preset (applies to every driver without their own). */
export async function setDefaultPresetAction(presetId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!presetId) return { error: 'Missing preset.' };

  const admin = createAdminClient();

  // The preset must belong to this org.
  const { data: preset } = await admin
    .from('settlement_presets')
    .select('id')
    .eq('id', presetId)
    .eq('organization_id', user.organization_id)
    .maybeSingle();
  if (!preset) return { error: 'Preset not found.' };

  const { error } = await admin
    .from('organizations')
    .update({ default_settlement_preset_id: presetId })
    .eq('id', user.organization_id);

  if (error) {
    console.error('setDefaultPresetAction failed:', error);
    return { error: 'Could not set the default preset.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}

/**
 * Assign a preset to a driver, or clear (null) to inherit the fleet default.
 * Scoped to the caller's org so an admin cannot touch another fleet's driver.
 */
export async function assignDriverPresetAction(
  driverId: string,
  presetId: string | null
): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!driverId) return { error: 'Missing driver.' };

  const admin = createAdminClient();

  if (presetId) {
    const { data: preset } = await admin
      .from('settlement_presets')
      .select('id')
      .eq('id', presetId)
      .eq('organization_id', user.organization_id)
      .maybeSingle();
    if (!preset) return { error: 'Preset not found.' };
  }

  const { error } = await admin
    .from('drivers')
    .update({ settlement_preset_id: presetId })
    .eq('id', driverId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('assignDriverPresetAction failed:', error);
    return { error: 'Could not assign the preset.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}
