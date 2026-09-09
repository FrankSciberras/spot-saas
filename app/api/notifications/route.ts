import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import {
  attachReadState,
  countUnread,
  scopeToViewer,
  type NotificationRowLike,
} from '@/lib/notifications/reads';

/**
 * GET /api/notifications?limit=&unread=true
 * Notifications for the current user in their ACTIVE fleet, with `read_at`
 * resolved PER USER for broadcasts (see lib/notifications/reads.ts).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);

  // Get driver_id if user is a driver in the ACTIVE fleet
  // (active-fleet scope: RLS alone merges a multi-fleet user's orgs)
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', session.id)
    .eq('organization_id', session.organization_id)
    .maybeSingle();
  const driverId = driver?.id ?? null;

  // Broadcast read state isn't a column we can filter on, so when only unread
  // rows are wanted fetch a wider page and filter after resolving read state.
  const fetchSize = unreadOnly ? Math.min(limit * 5, 300) : limit;

  let query = supabase
    .from('notifications')
    .select('*')
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id)
    .order('created_at', { ascending: false })
    .limit(fetchSize);
  query = scopeToViewer(query, driverId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = await attachReadState(supabase, session.id, (data ?? []) as NotificationRowLike[]);
  if (unreadOnly) rows = rows.filter((r) => !r.read_at);
  rows = rows.slice(0, limit);

  const unreadCount = await countUnread(supabase, session, driverId);

  return NextResponse.json({
    data: rows,
    unread_count: unreadCount,
  });
}

/**
 * POST /api/notifications
 * Create a new notification (admin/staff of the active fleet)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdminOrStaff(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { title, body: notificationBody, type, driver_id, action_url, broadcast } = body;

  if (!title || !notificationBody) {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
  }

  const notificationData: Record<string, unknown> = {
    organization_id: session.organization_id,
    title,
    body: notificationBody,
    type: type || 'info',
    action_url,
    sent_at: new Date().toISOString(),
  };

  // If broadcasting, driver_id stays null (goes to everyone)
  if (!broadcast && driver_id) {
    // The target driver must belong to the ACTIVE fleet
    // (active-fleet scope: RLS alone merges a multi-fleet user's orgs)
    const { data: targetDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('id', driver_id)
      .eq('organization_id', session.organization_id)
      .maybeSingle();

    if (!targetDriver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    notificationData.driver_id = driver_id;
    notificationData.target_role = 'driver';
  } else {
    // Broadcast notification - set target_role based on body param or default to 'all'
    notificationData.target_role = body.target_role || 'all';
  }

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert(notificationData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: notification }, { status: 201 });
}
