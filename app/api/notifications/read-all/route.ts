import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { markAllVisibleRead } from '@/lib/notifications/reads';

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the current user (per-user for broadcasts).
 * `/api/notifications/mark-all-read` is the same operation under its older name.
 */
export async function POST() {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
