'use server';

// =============================================================================
// PLATFORM-ADMIN BULK ACTIONS — the Admin Console's "select several, act once".
// =============================================================================
// The same changes as the per-row "Manage" menu (platform-billing.ts) and the
// inquiry inbox (contact.ts), applied to many rows in one round trip: one
// admin check, one query where the change is identical for every row, and a
// count of what actually changed so the UI can say "Updated 7 of 8".
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { TRIAL_PLAN, type Plan } from '@/lib/billing/plans';
import { getCurrentTrialDays } from '@/lib/billing/trial-offer-data';
import type { InquiryStatus } from '@/app/admin/console/types';

export interface BulkResult {
  ok?: boolean;
  error?: string;
  /** Rows actually changed. */
  updated?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 500;
const DAY = 86_400_000;

/** Unique, well-formed ids — or null when the selection can't be acted on. */
function cleanIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const out = [...new Set(ids.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)))];
  return out.length > 0 && out.length <= MAX_IDS ? out : null;
}

function done(updated: number): BulkResult {
  revalidatePath('/admin');
  revalidatePath('/admin/fleets');
  return { ok: true, updated };
}

/** Put every selected fleet on one plan (trial restarts a fresh trial from now). */
export async function bulkSetFleetPlanAction(ids: string[], plan: Plan): Promise<BulkResult> {
  await requirePlatformAdmin();
  const list = cleanIds(ids);
  if (!list) return { error: 'Select between 1 and 500 operators.' };

  const admin = createAdminClient();
  if (plan !== TRIAL_PLAN) {
    const { data: planRow } = await admin.from('plans').select('key').eq('key', plan).maybeSingle();
    if (!planRow) return { error: 'Unknown plan.' };
  }

  const now = new Date();
  const patch: Record<string, unknown> = { plan, status: 'active' };
  if (plan === TRIAL_PLAN) {
    patch.trial_started_at = now.toISOString();
    patch.trial_ends_at = new Date(now.getTime() + (await getCurrentTrialDays()) * DAY).toISOString();
    patch.plan_activated_at = null;
  } else {
    patch.plan_activated_at = now.toISOString();
  }

  const { data, error } = await admin.from('organizations').update(patch).in('id', list).select('id');
  if (error) {
    console.error('bulkSetFleetPlanAction failed:', error);
    return { error: 'Could not update the plans.' };
  }
  return done(data?.length ?? 0);
}

/** Move each selected fleet's trial end by `days` (from its own current end). */
export async function bulkExtendTrialAction(ids: string[], days: number): Promise<BulkResult> {
  await requirePlatformAdmin();
  const list = cleanIds(ids);
  if (!list) return { error: 'Select between 1 and 500 operators.' };
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 365) return { error: 'Pick a number of days.' };

  const admin = createAdminClient();
  const { data: orgs, error: readErr } = await admin.from('organizations').select('id, trial_ends_at').in('id', list);
  if (readErr || !orgs) return { error: 'Could not read the selected operators.' };

  const now = Date.now();
  let updated = 0;
  // Each fleet keeps its own end date, so these are separate updates — run a
  // few at a time rather than all at once.
  for (let i = 0; i < orgs.length; i += 10) {
    const results = await Promise.all(
      orgs.slice(i, i + 10).map((o) => {
        const base = o.trial_ends_at ? new Date(o.trial_ends_at as string).getTime() : now;
        // An expired trial is extended from today, not from the day it ended.
        const from = days > 0 ? Math.max(base, now) : base;
        return admin
          .from('organizations')
          .update({ trial_ends_at: new Date(from + days * DAY).toISOString(), plan: TRIAL_PLAN, status: 'active' })
          .eq('id', o.id as string);
      }),
    );
    for (const r of results) {
      if (r.error) console.error('bulkExtendTrialAction row failed:', r.error);
      else updated += 1;
    }
  }
  return done(updated);
}

/** Suspend or reactivate every selected fleet. */
export async function bulkSetFleetStatusAction(ids: string[], status: 'active' | 'suspended'): Promise<BulkResult> {
  await requirePlatformAdmin();
  const list = cleanIds(ids);
  if (!list) return { error: 'Select between 1 and 500 operators.' };
  if (status !== 'active' && status !== 'suspended') return { error: 'Invalid status.' };

  const { data, error } = await createAdminClient().from('organizations').update({ status }).in('id', list).select('id');
  if (error) {
    console.error('bulkSetFleetStatusAction failed:', error);
    return { error: 'Could not update the operators.' };
  }
  return done(data?.length ?? 0);
}

const INQUIRY_STATUSES: InquiryStatus[] = ['new', 'read', 'replied', 'archived'];

/** Move every selected inquiry to one triage state. */
export async function bulkSetInquiryStatusAction(ids: string[], status: InquiryStatus): Promise<BulkResult> {
  const adminUser = await requirePlatformAdmin();
  const list = cleanIds(ids);
  if (!list) return { error: 'Select between 1 and 500 inquiries.' };
  if (!INQUIRY_STATUSES.includes(status)) return { error: 'Invalid status.' };

  const { data, error } = await createAdminClient()
    .from('contact_inquiries')
    .update({ status, handled_by: adminUser.id, handled_at: new Date().toISOString() })
    .in('id', list)
    .select('id');
  if (error) {
    console.error('bulkSetInquiryStatusAction failed:', error);
    return { error: 'Could not update the inquiries.' };
  }
  return done(data?.length ?? 0);
}

/** Permanently delete every selected inquiry. */
export async function bulkDeleteInquiriesAction(ids: string[]): Promise<BulkResult> {
  await requirePlatformAdmin();
  const list = cleanIds(ids);
  if (!list) return { error: 'Select between 1 and 500 inquiries.' };

  const { data, error } = await createAdminClient().from('contact_inquiries').delete().in('id', list).select('id');
  if (error) {
    console.error('bulkDeleteInquiriesAction failed:', error);
    return { error: 'Could not delete the inquiries.' };
  }
  return done(data?.length ?? 0);
}
