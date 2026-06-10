'use server';

// =============================================================================
// PLAN / PACKAGE CATALOGUE ACTIONS (platform-admin only)
// =============================================================================
// CRUD for the DB-backed `plans` catalogue that drives marketing pricing,
// onboarding, the in-app billing screen and limit enforcement. Only the PLATFORM
// admin (the SaaS operator) may write — every action re-checks via
// requirePlatformAdmin() and writes with the service-role client.
//
// Mirrors lib/actions/vehicle-models.ts. `trial` is a built-in state, never a
// catalogue row, so it can't be created/edited here.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { TRIAL_PLAN } from '@/lib/billing/plans';
import type { PlanRow } from '@/lib/types/database';

type Result = { error?: string; ok?: boolean; plan?: PlanRow };

/** lowercase, hyphen-separated slug, e.g. "Pro Plus" -> "pro-plus". */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Editable fields accepted from the admin form. */
export interface PlanInput {
  name: string;
  blurb?: string | null;
  priceLabel?: string;
  priceUnit?: string | null;
  priceAmount?: number;
  billingNote?: string | null;
  capLabel?: string | null;
  maxDrivers?: number | null;
  maxVehicles?: number | null;
  features?: string[];
  color?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  isCustom?: boolean;
  isPopular?: boolean;
  isPublished?: boolean;
  /** Stripe recurring Price id (price_...). Empty clears it. */
  stripePriceId?: string | null;
  /** Stripe Product id (prod_...). Empty clears it. */
  stripeProductId?: string | null;
}

/** Map a PlanInput to DB columns, omitting undefined keys (partial updates). */
function toColumns(input: PlanInput): Record<string, unknown> {
  const col: Record<string, unknown> = {};
  if (input.name !== undefined) col.name = input.name.trim();
  if (input.blurb !== undefined) col.blurb = input.blurb?.trim() || null;
  if (input.priceLabel !== undefined) col.price_label = input.priceLabel.trim() || 'Custom';
  if (input.priceUnit !== undefined) col.price_unit = input.priceUnit?.trim() || null;
  if (input.priceAmount !== undefined) col.price_amount = Number.isFinite(input.priceAmount) ? input.priceAmount : 0;
  if (input.billingNote !== undefined) col.billing_note = input.billingNote?.trim() || null;
  if (input.capLabel !== undefined) col.cap_label = input.capLabel?.trim() || null;
  if (input.maxDrivers !== undefined) col.max_drivers = input.maxDrivers;
  if (input.maxVehicles !== undefined) col.max_vehicles = input.maxVehicles;
  if (input.features !== undefined) col.features = input.features.map((f) => f.trim()).filter(Boolean);
  if (input.color !== undefined) col.color = input.color?.trim() || null;
  if (input.ctaLabel !== undefined) col.cta_label = input.ctaLabel?.trim() || null;
  if (input.ctaHref !== undefined) col.cta_href = input.ctaHref?.trim() || null;
  if (input.isCustom !== undefined) col.is_custom = input.isCustom;
  if (input.isPopular !== undefined) col.is_popular = input.isPopular;
  if (input.isPublished !== undefined) col.is_published = input.isPublished;
  if (input.stripePriceId !== undefined) col.stripe_price_id = input.stripePriceId?.trim() || null;
  if (input.stripeProductId !== undefined) col.stripe_product_id = input.stripeProductId?.trim() || null;
  return col;
}

function revalidate() {
  revalidatePath('/admin');
  revalidatePath('/'); // marketing pricing
  revalidatePath('/billing');
  revalidatePath('/onboarding');
}

/** Create a new package. `key` is a unique slug derived from the name. */
export async function createPlanAction(input: PlanInput): Promise<Result> {
  await requirePlatformAdmin();

  const name = input.name?.trim();
  if (!name) return { error: 'Give the package a name.' };

  const base = slugify(name);
  if (!base) return { error: 'Name must contain letters or numbers.' };

  const admin = createAdminClient();

  // Ensure a unique key (append -2, -3, ... on collision; never 'trial').
  let key = base === TRIAL_PLAN ? `${base}-plan` : base;
  for (let i = 2; ; i++) {
    const { data: existing } = await admin.from('plans').select('id').eq('key', key).maybeSingle();
    if (!existing) break;
    key = `${base}-${i}`;
  }

  // Append after the current last package.
  const { data: lastRow } = await admin
    .from('plans')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((lastRow?.sort_order as number | undefined) ?? 0) + 1;

  const { data, error } = await admin
    .from('plans')
    .insert({ key, sort_order: sortOrder, ...toColumns(input) })
    .select()
    .single();

  if (error) {
    console.error('createPlanAction failed:', error);
    return { error: 'Could not create the package.' };
  }

  revalidate();
  return { ok: true, plan: data as PlanRow };
}

/** Update an existing package (partial). */
export async function updatePlanAction(id: string, input: PlanInput): Promise<Result> {
  await requirePlatformAdmin();
  if (!id) return { error: 'Missing package.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('plans')
    .update({ ...toColumns(input), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('updatePlanAction failed:', error);
    return { error: 'Could not save the package.' };
  }

  revalidate();
  return { ok: true };
}

/** Publish / unpublish (unpublished = hidden from public + operators). */
export async function setPlanPublishedAction(id: string, published: boolean): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from('plans')
    .update({ is_published: published, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('setPlanPublishedAction failed:', error);
    return { error: 'Could not update the package.' };
  }

  revalidate();
  return { ok: true };
}

/**
 * Persist a new ordering. `orderedIds` is the full list of plan ids in the
 * desired order; each row's sort_order is rewritten to its index (1-based).
 */
export async function reorderPlansAction(orderedIds: string[]): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const results = await Promise.all(
    orderedIds.map((id, i) =>
      admin.from('plans').update({ sort_order: i + 1, updated_at: new Date().toISOString() }).eq('id', id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('reorderPlansAction failed:', failed.error);
    return { error: 'Could not reorder packages.' };
  }

  revalidate();
  return { ok: true };
}

/**
 * Delete a package. Refused when any organization is currently on it — the admin
 * should move those fleets first (or just unpublish to hide it).
 */
export async function deletePlanAction(id: string): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const { data: plan } = await admin.from('plans').select('key').eq('id', id).maybeSingle();
  if (!plan) return { error: 'Package not found.' };

  const { count } = await admin
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('plan', plan.key as string);

  if ((count ?? 0) > 0) {
    return {
      error: `${count} operator${count === 1 ? ' is' : 's are'} still on this package. Move them to another plan first, or unpublish it.`,
    };
  }

  const { error } = await admin.from('plans').delete().eq('id', id);
  if (error) {
    console.error('deletePlanAction failed:', error);
    return { error: 'Could not delete the package.' };
  }

  revalidate();
  return { ok: true };
}
