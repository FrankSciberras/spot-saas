import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the current user
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's driver_id if they are a driver
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);

  if (driver) {
    query = query.or(`driver_id.eq.${driver.id},driver_id.is.null`);
  } else {
    query = query.or(`user_id.eq.${user.id},user_id.is.null,driver_id.is.null`);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
