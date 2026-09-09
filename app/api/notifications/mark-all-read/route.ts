import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { markAllVisibleRead } from '@/lib/notifications/reads';

/**
 * POST /api/notifications/mark-all-read
 * Older name for /api/notifications/read-all — kept because the driver portal
 * still calls it. Marks everything the viewer can see as read, per user for
 * broadcasts.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', session.id)
      .eq('organization_id', session.organization_id)
      .maybeSingle();

    const { marked } = await markAllVisibleRead(supabase, session, driver?.id ?? null);
    return NextResponse.json({ success: true, marked });
  } catch (error) {
    console.error('Error marking all as read:', error);
    return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 });
  }
}
