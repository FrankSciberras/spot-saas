import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/notifications
 * Get notifications for the current user
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = parseInt(searchParams.get('limit') || '20');

  // Get user's driver_id if they are a driver
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Filter by driver_id or user_id, or broadcast (both null)
  if (driver) {
    query = query.or(`driver_id.eq.${driver.id},driver_id.is.null`);
  } else {
    query = query.or(`user_id.eq.${user.id},user_id.is.null,driver_id.is.null`);
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
    countQuery = countQuery.or(`driver_id.eq.${driver.id},driver_id.is.null`);
  } else {
    countQuery = countQuery.or(`user_id.eq.${user.id},user_id.is.null,driver_id.is.null`);
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'staff'].includes(profile.role)) {
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
