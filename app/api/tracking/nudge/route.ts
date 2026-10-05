import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { sendDriverNudge } from '@/lib/tracking/nudge';

/**
 * POST /api/tracking/nudge  { driverId, reason? }
 * The Live Map's "Send alert" button: tells an on-shift driver their fleet
 * can't see their location (Rovora notification + email, push when set up).
 * Fleet admins/staff only, and only for drivers in their active fleet.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const isStaff = session.role === 'admin' || session.role === 'staff' || session.also_staff;
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { driverId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (typeof body.driverId !== 'string') return NextResponse.json({ error: 'driverId is required' }, { status: 400 });
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 400) || null : null;

  const res = await sendDriverNudge({
    organizationId: session.organization_id,
    driverId: body.driverId,
    sentBy: session.id,
    reason,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error, retryAfter: res.retryAfter }, { status: res.retryAfter ? 429 : 400 });
  }
  return NextResponse.json({ channels: res.channels });
}
