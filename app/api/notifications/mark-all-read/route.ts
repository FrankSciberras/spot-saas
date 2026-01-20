import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST - Mark all notifications as read
export async function POST() {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get driver_id if user is a driver
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Update all unread notifications (where read_at is null)
    let query = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);

    if (driver) {
      // Drivers can mark read: their notifications OR broadcasts targeted to drivers/all
      query = query.or(`driver_id.eq.${driver.id},and(driver_id.is.null,target_role.in.(driver,all))`);
    } else {
      // Admins can mark read: broadcasts targeted to admin/all
      query = query.is('driver_id', null).in('target_role', ['admin', 'all']);
    }

    const { error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking all as read:', error);
    return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 });
  }
}
