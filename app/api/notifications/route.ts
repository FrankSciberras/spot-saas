import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';

/**
 * GET /api/notifications
 * Get notifications for the current user
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20');

  // Get driver_id if user is a driver
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', session.id)
    .single();

  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Filter notifications based on user role
  if (driver) {
    // Drivers see: their notifications OR broadcasts targeted to drivers/all
    // RLS enforces target_role, but we also filter here for clarity
    query = query.or(`driver_id.eq.${driver.id},and(driver_id.is.null,target_role.in.(driver,all))`);
  } else {
    // Admins/staff see: broadcasts targeted to admin/all (not driver-only broadcasts)
    query = query.is('driver_id', null).in('target_role', ['admin', 'all']);
  }

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data: notifications, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get unread count
  let countQuery = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (driver) {
    countQuery = countQuery.or(`driver_id.eq.${driver.id},and(driver_id.is.null,target_role.in.(driver,all))`);
  } else {
    countQuery = countQuery.is('driver_id', null).in('target_role', ['admin', 'all']);
  }

  const { count: unreadCount } = await countQuery;

  return NextResponse.json({ 
    data: notifications,
    unread_count: unreadCount || 0,
  });
}

/**
 * POST /api/notifications
 * Create a new notification (admin only)
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
    title,
    body: notificationBody,
    type: type || 'info',
    action_url,
    sent_at: new Date().toISOString(),
  };

  // If broadcasting, driver_id stays null (goes to everyone)
  if (!broadcast && driver_id) {
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
