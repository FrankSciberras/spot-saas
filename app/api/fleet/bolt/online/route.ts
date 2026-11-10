import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { describeBoltError } from '@/lib/bolt/client';
import { boltClientFor, loadBoltConnection } from '@/lib/bolt/sync';

/**
 * GET /api/fleet/bolt/online
 * Who is online on Bolt RIGHT NOW for the caller's active fleet — fetched live
 * from Bolt on every call (nothing is stored). Fleet admins only.
 *
 * Returns just what the panel shows: name, state, car. No phone numbers, emails
 * or GPS positions leave the server.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();
  const conn = await loadBoltConnection(admin, session.organization_id);
  if (!conn) return NextResponse.json({ error: 'Bolt isn’t connected.' }, { status: 404 });

  try {
    const online = await boltClientFor(conn).getOnlineDrivers(Number(conn.company_id));
    const drivers = online.map((d) => ({
      uuid: d.uuid,
      name: [d.first_name, d.last_name].filter(Boolean).join(' ') || d.display_name || 'Driver',
      state: d.current_state?.code ?? 'waiting',
      since: d.current_state?.changed_at ?? null,
      vehicle: d.vehicle
        ? { reg: d.vehicle.registration_number, model: [d.vehicle.make, d.vehicle.model].filter(Boolean).join(' ') }
        : null,
      category: d.current_order?.category_name ?? null,
    }));
    return NextResponse.json({ drivers, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: describeBoltError(error) }, { status: 502 });
  }
}
