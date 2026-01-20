import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// DELETE - Delete a notification
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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

    // Delete the notification (with proper filtering)
    let query = supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (driver) {
      // Drivers can delete their notifications OR broadcasts targeted to drivers/all
      query = query.or(`driver_id.eq.${driver.id},and(driver_id.is.null,target_role.in.(driver,all))`);
    } else {
      // Admins can delete broadcasts targeted to admin/all
      query = query.is('driver_id', null).in('target_role', ['admin', 'all']);
    }

    const { error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}
