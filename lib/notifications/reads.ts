// =============================================================================
// NOTIFICATION READ STATE (server only)
// =============================================================================
// Two kinds of notification rows:
//   * driver-addressed (driver_id set) — one row per driver; its own read_at is
//     that driver's read state.
//   * broadcast (driver_id NULL) — one row shared by every admin/staff member
//     (or every driver) it targets. Read state lives PER USER in
//     notification_reads; the row's read_at is ignored for these. Before this,
//     the first admin to click "mark read" cleared the alert for everyone.
//
// All helpers take the caller's RLS client: notification_reads policies only
// let a user see/insert their own rows.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionUser } from '@/lib/types/database';

export interface NotificationRowLike {
  id: string;
  driver_id: string | null;
  read_at: string | null;
}

/** Most rows a "mark all read" / unread count will ever look at. */
export const READ_SCAN_LIMIT = 500;

/**
 * Restrict a notifications query to what this viewer may see: their own
 * driver-addressed rows plus the broadcasts aimed at their role.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scopeToViewer<Q extends { or: (f: string) => Q; is: (c: string, v: any) => Q; in: (c: string, v: any[]) => Q }>(
  query: Q,
  driverId: string | null
): Q {
  if (driverId) {
    return query.or(`driver_id.eq.${driverId},and(driver_id.is.null,target_role.in.(driver,all))`);
  }
  return query.is('driver_id', null).in('target_role', ['admin', 'all']);
}

/** Resolve read_at per row for THIS user (broadcasts from notification_reads). */
export async function attachReadState<T extends NotificationRowLike>(
  supabase: SupabaseClient,
  userId: string,
  rows: T[]
): Promise<T[]> {
  const broadcastIds = rows.filter((r) => !r.driver_id).map((r) => r.id);
  if (broadcastIds.length === 0) return rows;

  const reads = new Map<string, string>();
  for (let i = 0; i < broadcastIds.length; i += 200) {
    const slice = broadcastIds.slice(i, i + 200);
    const { data } = await supabase
      .from('notification_reads')
      .select('notification_id, read_at')
      .eq('user_id', userId)
      .in('notification_id', slice);
    for (const r of (data ?? []) as { notification_id: string; read_at: string }[]) reads.set(r.notification_id, r.read_at);
  }

  return rows.map((r) => (r.driver_id ? r : { ...r, read_at: reads.get(r.id) ?? null }));
}

/** Record that this user has read these broadcasts (idempotent). */
export async function markBroadcastsRead(supabase: SupabaseClient, userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      ids.map((id) => ({ notification_id: id, user_id: userId, read_at: nowIso })),
      { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

/**
 * Mark ONE notification read for this user: broadcasts go to notification_reads,
 * a driver-addressed row gets its read_at set (RLS: the driver's own row).
 */
export async function markOneRead(
  supabase: SupabaseClient,
  session: SessionUser,
  driverId: string | null,
  notificationId: string
): Promise<'ok' | 'not_found'> {
  let q = supabase
    .from('notifications')
    .select('id, driver_id, read_at')
    .eq('id', notificationId)
    .eq('organization_id', session.organization_id);
  q = scopeToViewer(q, driverId);
  const { data: row } = await q.maybeSingle();
  if (!row) return 'not_found';

  if (!row.driver_id) {
    await markBroadcastsRead(supabase, session.id, [row.id]);
    return 'ok';
  }
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('organization_id', session.organization_id);
  if (error) throw error;
  return 'ok';
}

/** Mark everything this viewer can currently see as read. */
export async function markAllVisibleRead(
  supabase: SupabaseClient,
  session: SessionUser,
  driverId: string | null
): Promise<{ marked: number }> {
  let q = supabase
    .from('notifications')
    .select('id, driver_id, read_at')
    .eq('organization_id', session.organization_id)
    .order('created_at', { ascending: false })
    .limit(READ_SCAN_LIMIT);
  q = scopeToViewer(q, driverId);
  const { data } = await q;
  const rows = await attachReadState(supabase, session.id, (data ?? []) as NotificationRowLike[]);
  const unread = rows.filter((r) => !r.read_at);

  const broadcastIds = unread.filter((r) => !r.driver_id).map((r) => r.id);
  const ownIds = unread.filter((r) => r.driver_id).map((r) => r.id);

  await markBroadcastsRead(supabase, session.id, broadcastIds);
  if (ownIds.length) {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ownIds)
      .eq('organization_id', session.organization_id);
    if (error) throw error;
  }
  return { marked: unread.length };
}

/** Unread count for this viewer (bounded by READ_SCAN_LIMIT most recent rows). */
export async function countUnread(
  supabase: SupabaseClient,
  session: SessionUser,
  driverId: string | null
): Promise<number> {
  let q = supabase
    .from('notifications')
    .select('id, driver_id, read_at')
    .eq('organization_id', session.organization_id)
    .order('created_at', { ascending: false })
    .limit(READ_SCAN_LIMIT);
  q = scopeToViewer(q, driverId);
  const { data } = await q;
  const rows = await attachReadState(supabase, session.id, (data ?? []) as NotificationRowLike[]);
  return rows.filter((r) => !r.read_at).length;
}
