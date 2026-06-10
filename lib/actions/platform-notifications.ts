'use server';

// =============================================================================
// PLATFORM NOTIFICATIONS (Tier 1 — the SaaS operator broadcasts to clients)
// =============================================================================
// Lets the platform admin send a notification, cross-tenant, to fleet operators
// (their admins/staff) or to drivers — flexibly scoped (all / specific / by
// plan). Writes go through the service-role client and stamp organization_id on
// every row, so each recipient reads them through their normal RLS. Every send
// is tagged source='platform' + sender_label='Rovora HQ' so recipients see who
// it's from, and summarised in platform_broadcasts for history.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';

const SENDER_LABEL = 'Rovora HQ';

export type BroadcastChannel = 'app' | 'push' | 'email';

export interface BroadcastAudience {
  type: 'operators' | 'drivers';
  /** operators: all|operators|plan · drivers: all|operators|drivers */
  scope: 'all' | 'operators' | 'plan' | 'drivers';
  operatorIds?: string[];
  planKeys?: string[];
  driverIds?: string[];
}

export interface SendBroadcastInput {
  title: string;
  body: string;
  actionUrl?: string;
  channels: BroadcastChannel[];
  audience: BroadcastAudience;
}

interface SendResult {
  error?: string;
  ok?: boolean;
  recipientCount?: number;
  results?: Record<BroadcastChannel, { sent: number; failed: number }>;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Resolve admin/staff users (id, email) for the given org ids. */
async function adminStaffOf(admin: AdminClient, orgIds: string[]) {
  if (orgIds.length === 0) return [] as { id: string; email: string; full_name: string | null }[];
  const { data: mems } = await admin
    .from('memberships')
    .select('user_id, role')
    .in('organization_id', orgIds)
    .in('role', ['admin', 'staff']);
  const ids = Array.from(new Set(((mems ?? []) as { user_id: string }[]).map((m) => m.user_id)));
  if (ids.length === 0) return [];
  const { data: users } = await admin.from('users').select('id, email, full_name').in('id', ids);
  return (users ?? []) as { id: string; email: string; full_name: string | null }[];
}

export async function sendPlatformBroadcastAction(input: SendBroadcastInput): Promise<SendResult> {
  const adminUser = await requirePlatformAdmin();

  const title = input.title?.trim();
  const body = input.body?.trim();
  const actionUrl = input.actionUrl?.trim() || null;
  const channels = (input.channels ?? []).filter((c): c is BroadcastChannel => ['app', 'push', 'email'].includes(c));

  if (!title || !body) return { error: 'Title and message are required.' };
  if (channels.length === 0) return { error: 'Pick at least one channel.' };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const results: Record<BroadcastChannel, { sent: number; failed: number }> = {
    app: { sent: 0, failed: 0 },
    push: { sent: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
  };

  let recipientCount = 0;
  let targetSummary = '';
  const aud = input.audience;

  if (aud.type === 'operators') {
    // ── Recipients are fleet admins/staff ──────────────────────────────────
    let orgs: { id: string; name: string; plan: string }[] = [];
    if (aud.scope === 'all') {
      const { data } = await admin.from('organizations').select('id, name, plan');
      orgs = (data as typeof orgs) ?? [];
      targetSummary = 'All operators';
    } else if (aud.scope === 'plan') {
      const keys = aud.planKeys ?? [];
      if (keys.length === 0) return { error: 'Select at least one plan.' };
      const { data } = await admin.from('organizations').select('id, name, plan').in('plan', keys);
      orgs = (data as typeof orgs) ?? [];
      targetSummary = `Operators on ${keys.join(', ')}`;
    } else {
      const ids = aud.operatorIds ?? [];
      if (ids.length === 0) return { error: 'Select at least one operator.' };
      const { data } = await admin.from('organizations').select('id, name, plan').in('id', ids);
      orgs = (data as typeof orgs) ?? [];
      targetSummary = `${orgs.length} operator${orgs.length === 1 ? '' : 's'}`;
    }

    if (orgs.length === 0) return { error: 'No operators matched that audience.' };

    // In-app: one broadcast row per org, targeted at its admins.
    if (channels.includes('app')) {
      const rows = orgs.map((o) => ({
        organization_id: o.id,
        driver_id: null,
        title,
        body,
        type: 'info',
        action_url: actionUrl,
        target_role: 'admin',
        source: 'platform',
        sender_label: SENDER_LABEL,
        sent_at: now,
        created_at: now,
      }));
      const { error } = await admin.from('notifications').insert(rows);
      if (error) {
        console.error('platform broadcast (operators app) failed:', error);
        results.app.failed += rows.length;
      } else {
        results.app.sent += rows.length;
      }
    }

    // Push / email go to each admin/staff user of the target orgs.
    const users = await adminStaffOf(admin, orgs.map((o) => o.id));
    recipientCount = users.length;

    if (channels.includes('push')) {
      for (const u of users) {
        try {
          const sent = await sendPushNotification(u.id, { title, body, url: actionUrl || '/fleet/notifications' });
          sent ? results.push.sent++ : results.push.failed++;
        } catch { results.push.failed++; }
      }
    }
    if (channels.includes('email')) {
      for (const u of users) {
        try {
          const sent = await sendEmailNotification({ to: u.email, subject: title, body, driverName: u.full_name || undefined, actionUrl: actionUrl || undefined });
          sent ? results.email.sent++ : results.email.failed++;
        } catch { results.email.failed++; }
      }
    }
  } else {
    // ── Recipients are drivers ─────────────────────────────────────────────
    let q = admin.from('drivers').select('id, full_name, user_id, organization_id, status');
    if (aud.scope === 'operators') {
      const ids = aud.operatorIds ?? [];
      if (ids.length === 0) return { error: 'Select at least one operator.' };
      q = q.in('organization_id', ids);
      targetSummary = `Drivers of ${ids.length} operator${ids.length === 1 ? '' : 's'}`;
    } else if (aud.scope === 'drivers') {
      const ids = aud.driverIds ?? [];
      if (ids.length === 0) return { error: 'Select at least one driver.' };
      q = q.in('id', ids);
      targetSummary = `${ids.length} driver${ids.length === 1 ? '' : 's'}`;
    } else {
      targetSummary = 'All drivers';
    }

    const { data: drivers } = await q;
    const list = (drivers ?? []) as { id: string; full_name: string; user_id: string; organization_id: string }[];
    if (list.length === 0) return { error: 'No drivers matched that audience.' };
    recipientCount = list.length;

    if (channels.includes('app')) {
      const rows = list.map((d) => ({
        organization_id: d.organization_id,
        driver_id: d.id,
        title,
        body,
        type: 'info',
        action_url: actionUrl,
        target_role: 'driver',
        source: 'platform',
        sender_label: SENDER_LABEL,
        sent_at: now,
        created_at: now,
      }));
      const { error } = await admin.from('notifications').insert(rows);
      if (error) {
        console.error('platform broadcast (drivers app) failed:', error);
        results.app.failed += rows.length;
      } else {
        results.app.sent += rows.length;
      }
    }

    // Emails: resolve driver user emails.
    const userIds = Array.from(new Set(list.map((d) => d.user_id).filter(Boolean)));
    const emailById = new Map<string, string>();
    if (channels.includes('email') && userIds.length) {
      const { data: us } = await admin.from('users').select('id, email').in('id', userIds);
      for (const u of (us ?? []) as { id: string; email: string }[]) emailById.set(u.id, u.email);
    }

    if (channels.includes('push')) {
      for (const d of list) {
        if (!d.user_id) { results.push.failed++; continue; }
        try {
          const sent = await sendPushNotification(d.user_id, { title, body, url: actionUrl || '/driver/notifications' });
          sent ? results.push.sent++ : results.push.failed++;
        } catch { results.push.failed++; }
      }
    }
    if (channels.includes('email')) {
      for (const d of list) {
        const email = emailById.get(d.user_id);
        if (!email) { results.email.failed++; continue; }
        try {
          const sent = await sendEmailNotification({ to: email, subject: title, body, driverName: d.full_name, actionUrl: actionUrl || undefined });
          sent ? results.email.sent++ : results.email.failed++;
        } catch { results.email.failed++; }
      }
    }
  }

  // History row.
  await admin.from('platform_broadcasts').insert({
    title,
    body,
    action_url: actionUrl,
    channels,
    audience_type: aud.type,
    audience_scope: aud.scope,
    target_summary: targetSummary,
    recipient_count: recipientCount,
    results,
    sent_by: adminUser.id,
    created_at: now,
  });

  revalidatePath('/admin');
  return { ok: true, recipientCount, results };
}

// ── Audience + history reads (platform-admin only) ──────────────────────────

export interface AudienceOperator {
  id: string;
  name: string;
  plan: string;
  driverCount: number;
}

export async function getBroadcastAudienceAction(): Promise<{
  operators: AudienceOperator[];
  plans: { key: string; name: string }[];
}> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const [{ data: orgs }, { data: plans }, { data: drivers }] = await Promise.all([
    admin.from('organizations').select('id, name, plan').order('name'),
    admin.from('plans').select('key, name').order('sort_order'),
    admin.from('drivers').select('organization_id'),
  ]);

  const driverCount = new Map<string, number>();
  for (const d of (drivers ?? []) as { organization_id: string }[]) {
    driverCount.set(d.organization_id, (driverCount.get(d.organization_id) ?? 0) + 1);
  }

  const operators: AudienceOperator[] = ((orgs ?? []) as { id: string; name: string; plan: string }[]).map((o) => ({
    id: o.id,
    name: o.name,
    plan: o.plan,
    driverCount: driverCount.get(o.id) ?? 0,
  }));

  return {
    operators,
    plans: (plans ?? []) as { key: string; name: string }[],
  };
}

export async function getOperatorDriversAction(
  organizationId: string
): Promise<{ drivers: { id: string; full_name: string; status: string }[] }> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from('drivers')
    .select('id, full_name, status')
    .eq('organization_id', organizationId)
    .order('full_name');
  return { drivers: (data ?? []) as { id: string; full_name: string; status: string }[] };
}

export interface PlatformBroadcastRow {
  id: string;
  title: string;
  body: string;
  channels: string[];
  audience_type: string;
  target_summary: string | null;
  recipient_count: number;
  created_at: string;
}

export async function getPlatformBroadcastsAction(): Promise<{ broadcasts: PlatformBroadcastRow[] }> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from('platform_broadcasts')
    .select('id, title, body, channels, audience_type, target_summary, recipient_count, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return { broadcasts: (data ?? []) as PlatformBroadcastRow[] };
}
