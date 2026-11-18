import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { loadGpsConnections, syncGpsConnection } from '@/lib/gps/sync';

/**
 * POST /api/fleet/gps/refresh
 * Called by the Live Map every ~30 s while it's open: pulls the latest tracker
 * positions for the caller's active fleet, unless they were pulled less than
 * 25 s ago (by the scheduler or another open map). The map then picks the new
 * positions up from gps_devices via Realtime — nothing is returned but counts.
 *
 * Fleet admins and staff (the people who can see the Live Map).
 */
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const canSeeMap = session.role === 'admin' || session.role === 'staff' || session.also_staff;
  if (!canSeeMap) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const connections = await loadGpsConnections(admin, session.organization_id);
  let synced = 0;
  for (const conn of connections) {
    const res = await syncGpsConnection(admin, conn, { minIntervalMs: 25_000 });
    if (res.ran && res.ok) synced++;
  }
  return NextResponse.json({ connections: connections.length, synced });
}
