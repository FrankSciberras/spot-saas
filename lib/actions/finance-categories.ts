'use server';

// =============================================================================
// FINANCE CATEGORY ACTIONS (per-fleet editable bookkeeping categories)
// =============================================================================
// A fleet ADMIN manages the income and expense lines their books are kept in:
// add (from a preset or from scratch), rename, recolour, reorder, deactivate.
// Every action re-checks the admin role server-side via requireRole(['admin'])
// and writes with the service-role client scoped to the caller's organization_id.
//
// Deactivating hides a category from NEW periods; entries already recorded
// against it are untouched and still count in reports. Deleting is only allowed
// while a category is unused — the DB enforces this too (ON DELETE RESTRICT),
// this layer just turns that into a sentence a human can act on.
//
// Mirrors lib/actions/platforms.ts, which did the same for ride platforms.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import {
  CATEGORY_PRESETS,
  slugifyCategoryKey,
  type CategoryKind,
} from '@/lib/config/financeCategories';

type Result = { error?: string; ok?: boolean; id?: string };

export interface FinanceCategoryInput {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
}

function sanitize(input: FinanceCategoryInput): { error?: string; values?: Record<string, unknown> } {
  const name = (input.name || '').trim();
  if (!name) return { error: 'Give the category a name.' };
  if (name.length > 40) return { error: 'Category name is too long (max 40 characters).' };

  const kind: CategoryKind = input.kind === 'income' ? 'income' : 'expense';
  const icon = (input.icon || '').trim() || 'dots';
  const color = /^#[0-9a-fA-F]{6}$/.test((input.color || '').trim())
    ? input.color.trim()
    : '#2bbd7e';

  return { values: { name, kind, icon: icon.slice(0, 24), color } };
}

function revalidateBookkeepingPages() {
  revalidatePath('/fleet/earnings');
  revalidatePath('/fleet/financials');
  revalidatePath('/fleet');
}

/**
 * Make sure the fleet has its default categories.
 *
 * Self-heal for fleets created before the seeding trigger existed, so the
 * bookkeeping page never renders an empty chart of accounts. Idempotent — the
 * RPC returns immediately if any rows already exist.
 */
export async function ensureFinanceCategoriesAction(): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();

  const { error } = await admin.rpc('seed_default_finance_categories', {
    p_org: user.organization_id,
  });

  if (error) {
    console.error('ensureFinanceCategoriesAction failed:', error);
    return { error: 'Could not set up the default categories.' };
  }

  revalidateBookkeepingPages();
  return { ok: true };
}

/** Add a category. The key is derived from the name and never changes after. */
export async function createFinanceCategoryAction(
  input: FinanceCategoryInput,
): Promise<Result> {
  const user = await requireRole(['admin']);

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();

  // Derive a stable, unique key from the name.
  const base = slugifyCategoryKey(values.name as string);
  let key = base;
  for (let i = 2; i <= 50; i++) {
    const { data: clash } = await admin
      .from('org_finance_categories')
      .select('id')
      .eq('organization_id', user.organization_id)
      .eq('key', key)
      .maybeSingle();
    if (!clash) break;
    key = `${base}_${i}`;
  }

  // Sort order runs per kind, so income and expense lists number independently.
  const { data: maxRow } = await admin
    .from('org_finance_categories')
    .select('sort_order')
    .eq('organization_id', user.organization_id)
    .eq('kind', values.kind)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from('org_finance_categories')
    .insert({
      ...values,
      key,
      organization_id: user.organization_id,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single();

  if (error) {
    console.error('createFinanceCategoryAction failed:', error);
    return { error: 'Could not add the category.' };
  }

  revalidateBookkeepingPages();
  return { ok: true, id: data.id };
}

/** Add one of the built-in presets by key. */
export async function createFinanceCategoryFromPresetAction(
  presetKey: string,
): Promise<Result> {
  const preset = CATEGORY_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return { error: 'Unknown category preset.' };

  return createFinanceCategoryAction({
    name: preset.name,
    kind: preset.kind,
    icon: preset.icon,
    color: preset.color,
  });
}

/**
 * Rename / recolour a category. The key, and every entry pointing at it, stay
 * put — so renaming "Employees" to "Driver wages" relabels history rather than
 * splitting it.
 */
export async function updateFinanceCategoryAction(
  categoryId: string,
  input: FinanceCategoryInput,
): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!categoryId) return { error: 'Missing category.' };

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();

  // Changing kind would flip recorded amounts between income and expense and
  // silently rewrite past profit figures. Name and styling only.
  delete values.kind;

  const { error } = await admin
    .from('org_finance_categories')
    .update(values)
    .eq('id', categoryId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('updateFinanceCategoryAction failed:', error);
    return { error: 'Could not save the category.' };
  }

  revalidateBookkeepingPages();
  return { ok: true };
}

/** Show/hide a category on new periods. Recorded entries are unaffected. */
export async function setFinanceCategoryActiveAction(
  categoryId: string,
  isActive: boolean,
): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!categoryId) return { error: 'Missing category.' };

  const admin = createAdminClient();

  const { data: category } = await admin
    .from('org_finance_categories')
    .select('kind, is_system')
    .eq('id', categoryId)
    .eq('organization_id', user.organization_id)
    .maybeSingle();

  if (!category) return { error: 'Category not found.' };

  if (!isActive) {
    if (category.is_system) {
      return { error: 'The "Other" categories are always available and cannot be hidden.' };
    }
    // Keep at least one active category per kind, or that half of the form
    // renders empty with no way back.
    const { count } = await admin
      .from('org_finance_categories')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', user.organization_id)
      .eq('kind', category.kind)
      .eq('is_active', true);

    if ((count ?? 0) <= 1) {
      return { error: `You need at least one active ${category.kind} category.` };
    }
  }

  const { error } = await admin
    .from('org_finance_categories')
    .update({ is_active: isActive })
    .eq('id', categoryId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('setFinanceCategoryActiveAction failed:', error);
    return { error: 'Could not update the category.' };
  }

  revalidateBookkeepingPages();
  return { ok: true };
}

/**
 * Delete a category — only while nothing has been recorded against it.
 *
 * Once it has entries the honest options are to rename it or deactivate it;
 * deleting would either destroy recorded figures or orphan them, and neither
 * is something to do quietly to someone's accounts.
 */
export async function deleteFinanceCategoryAction(categoryId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!categoryId) return { error: 'Missing category.' };

  const admin = createAdminClient();

  const { data: category } = await admin
    .from('org_finance_categories')
    .select('name, is_system')
    .eq('id', categoryId)
    .eq('organization_id', user.organization_id)
    .maybeSingle();

  if (!category) return { error: 'Category not found.' };
  if (category.is_system) {
    return { error: 'The "Other" categories cannot be deleted.' };
  }

  const { count: entryCount } = await admin
    .from('bookkeeping_entries')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', user.organization_id)
    .eq('category_id', categoryId);

  if ((entryCount ?? 0) > 0) {
    return {
      error: `"${category.name}" has ${entryCount} recorded amount${entryCount === 1 ? '' : 's'}. Hide it instead to keep your history intact.`,
    };
  }

  const { count: costCount } = await admin
    .from('vehicle_recurring_costs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', user.organization_id)
    .eq('category_id', categoryId);

  if ((costCount ?? 0) > 0) {
    return {
      error: `"${category.name}" is used by ${costCount} recurring vehicle cost${costCount === 1 ? '' : 's'}. Remove those first.`,
    };
  }

  const { error } = await admin
    .from('org_finance_categories')
    .delete()
    .eq('id', categoryId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('deleteFinanceCategoryAction failed:', error);
    return { error: 'Could not delete the category.' };
  }

  revalidateBookkeepingPages();
  return { ok: true };
}

/** Persist a drag-reordered list. Ids must all belong to the caller's fleet. */
export async function reorderFinanceCategoriesAction(
  orderedIds: string[],
): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: 'Nothing to reorder.' };
  }

  const admin = createAdminClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('org_finance_categories')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('organization_id', user.organization_id);

    if (error) {
      console.error('reorderFinanceCategoriesAction failed:', error);
      return { error: 'Could not save the new order.' };
    }
  }

  revalidateBookkeepingPages();
  return { ok: true };
}
