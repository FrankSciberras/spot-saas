'use server';

// =============================================================================
// ORG PLATFORM ACTIONS (per-fleet editable ride platforms)
// =============================================================================
// A fleet ADMIN manages the platforms their drivers work on (Bolt, Uber, …):
// add, rename, change the default fee %, set icon/color, deactivate. Every
// action re-checks the admin role server-side via requireRole(['admin']) and
// writes with the service-role client scoped to the caller's organization_id.
//
// Deactivating hides a platform from NEW settlements; existing settlements are
// untouched (they snapshot platform_id + name + fee). Deleting is allowed too —
// history still reads fine from the snapshots — but the UI confirms first.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { clampPercent } from '@/lib/config/settlements';

type Result = { error?: string; ok?: boolean; id?: string };

export interface PlatformInput {
  name: string;
  default_fee_pct: number;
  icon: string;
  color: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitize(input: PlatformInput): { error?: string; values?: Record<string, unknown> } {
  const name = (input.name || '').trim();
  if (!name) return { error: 'Give the platform a name.' };
  if (name.length > 40) return { error: 'Platform name is too long (max 40 characters).' };

  const icon = (input.icon || '').trim() || '🚗';
  const color = /^#[0-9a-fA-F]{6}$/.test((input.color || '').trim()) ? input.color.trim() : '#2bbd7e';

  return {
    values: {
      name,
      default_fee_pct: clampPercent(input.default_fee_pct, 10),
      icon: icon.slice(0, 8),
      color,
    },
  };
}

function revalidateSettlementPages() {
  revalidatePath('/fleet/settlements/settings');
  revalidatePath('/fleet/settlements');
}

/** Add a platform. The key is derived from the name and never changes after. */
export async function createPlatformAction(input: PlatformInput): Promise<Result> {
  const user = await requireRole(['admin']);

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();

  // Derive a stable, unique key from the name (key is what settlements store).
  const base = slugify(values.name as string) || 'platform';
  let key = base;
  for (let i = 2; i <= 50; i++) {
    const { data: clash } = await admin
      .from('org_platforms')
      .select('id')
      .eq('organization_id', user.organization_id)
      .eq('key', key)
      .maybeSingle();
    if (!clash) break;
    key = `${base}-${i}`;
  }

  const { data: maxRow } = await admin
    .from('org_platforms')
    .select('sort_order')
    .eq('organization_id', user.organization_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from('org_platforms')
    .insert({
      ...values,
      key,
      organization_id: user.organization_id,
      sort_order: (maxRow?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single();

  if (error) {
    console.error('createPlatformAction failed:', error);
    return { error: 'Could not add the platform.' };
  }

  revalidateSettlementPages();
  return { ok: true, id: data.id };
}

/** Rename / re-fee / restyle a platform. The key (and history) stay put. */
export async function updatePlatformAction(platformId: string, input: PlatformInput): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!platformId) return { error: 'Missing platform.' };

  const { error: vErr, values } = sanitize(input);
  if (vErr || !values) return { error: vErr };

  const admin = createAdminClient();
  const { error } = await admin
    .from('org_platforms')
    .update(values)
    .eq('id', platformId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('updatePlatformAction failed:', error);
    return { error: 'Could not save the platform.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}

/** Show/hide a platform on new settlements. History is unaffected. */
export async function setPlatformActiveAction(platformId: string, isActive: boolean): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!platformId) return { error: 'Missing platform.' };

  const admin = createAdminClient();

  if (!isActive) {
    // Keep at least one active platform, or the settlement form goes blank.
    const { count } = await admin
      .from('org_platforms')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', user.organization_id)
      .eq('is_active', true);
    if ((count ?? 0) <= 1) {
      return { error: 'You need at least one active platform.' };
    }
  }

  const { error } = await admin
    .from('org_platforms')
    .update({ is_active: isActive })
    .eq('id', platformId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('setPlatformActiveAction failed:', error);
    return { error: 'Could not update the platform.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}

/** Delete a platform. Saved settlements keep their snapshots and read fine. */
export async function deletePlatformAction(platformId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  if (!platformId) return { error: 'Missing platform.' };

  const admin = createAdminClient();

  const { count } = await admin
    .from('org_platforms')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', user.organization_id);
  if ((count ?? 0) <= 1) {
    return { error: 'You need at least one platform. Add another before deleting this one.' };
  }

  const { error } = await admin
    .from('org_platforms')
    .delete()
    .eq('id', platformId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('deletePlatformAction failed:', error);
    return { error: 'Could not delete the platform.' };
  }

  revalidateSettlementPages();
  return { ok: true };
}
