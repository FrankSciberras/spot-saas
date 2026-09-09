import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { markOneRead } from '@/lib/notifications/reads';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/notifications/[id]/read
 * Mark a notification as read FOR THIS USER. Broadcasts are recorded per user
 * (notification_reads), so one admin's click no longer clears the alert for
 * every other admin; driver-addressed rows keep their own read_at.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
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

    const result = await markOneRead(supabase, session, driver?.id ?? null, id);
    if (result === 'not_found') {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
