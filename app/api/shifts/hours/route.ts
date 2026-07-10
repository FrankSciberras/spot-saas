import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { round2 } from '@/lib/utils/settlementCalculations';

/**
 * GET /api/shifts/hours?driver_id=&from=&to=
 *
 * Total hours a driver worked in a period, summed from their completed shifts
 * (clock-in → clock-out). Used to prefill the "Hours worked" field on wage
 * settlements — the operator can still edit the number before saving.
 *
 * A shift counts when it STARTS inside the period (dates inclusive); open
 * shifts (no end_time yet) are ignored.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin' && session.role !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get('driver_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!driverId || !from || !to) {
      return NextResponse.json({ error: 'driver_id, from and to are required' }, { status: 400 });
    }

    // RLS scopes rows to the caller's organization.
    const supabase = await createClient();
    const { data: shifts, error } = await supabase
      .from('driver_shifts')
      .select('start_time, end_time')
      .eq('driver_id', driverId)
      .gte('start_time', `${from}T00:00:00`)
      .lte('start_time', `${to}T23:59:59`)
      .not('end_time', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let totalMs = 0;
    for (const s of shifts || []) {
      const start = new Date(s.start_time).getTime();
      const end = new Date(s.end_time as string).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        totalMs += end - start;
      }
    }

    return NextResponse.json({
      hours: round2(totalMs / 3_600_000),
      shifts: (shifts || []).length,
    });
  } catch (error) {
    console.error('Error computing shift hours:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
