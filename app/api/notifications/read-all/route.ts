import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the current user
 */
export async function POST() {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's driver_id if they are a driver in the ACTIVE fleet
  // (active-fleet scope: RLS alone merges a multi-fleet user's orgs)
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', session.id)
    .eq('organization_id', session.organization_id)
    .single();

  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id)
    .is('read_at', null);

  if (driver) {
    // Drivers can mark read: their notifications OR broadcasts targeted to drivers/all
    query = query.or(`driver_id.eq.${driver.id},and(driver_id.is.null,target_role.in.(driver,all))`);
  } else {
    // Admins can mark read: broadcasts targeted to admin/all
    query = query.is('driver_id', null).in('target_role', ['admin', 'all']);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
