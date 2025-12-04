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

    // Delete the notifications (RLS will ensure user can only delete their own)
    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('Error bulk deleting notifications:', error);
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 });
  }
}
