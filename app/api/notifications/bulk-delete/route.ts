import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST - Bulk delete notifications
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No notification IDs provided' }, { status: 400 });
    }

    // Get driver_id if user is a driver
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    // Delete the notifications (with proper filtering)
    let query = supabase
      .from('notifications')
      .delete()
      .in('id', ids);

    if (driver) {
      // Drivers can delete their notifications OR broadcasts targeted to drivers/all
      query = query.or(`driver_id.eq.${driver.id},and(driver_id.is.null,target_role.in.(driver,all))`);
    } else {
      // Admins can delete broadcasts targeted to admin/all
      query = query.is('driver_id', null).in('target_role', ['admin', 'all']);
    }

    const { error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('Error bulk deleting notifications:', error);
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
  }
}
