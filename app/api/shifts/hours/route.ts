import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { round2 } from '@/lib/utils/settlementCalculations';

const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';
const OPEN_SHIFT_CAP_MS = 24 * 3_600_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' of an instant in the fleet's local time zone. */
function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

/**
 * GET /api/shifts/hours?driver_id=&from=&to=
 *
 * Total hours a driver worked in a period, summed from their shifts
 * (clock-in → clock-out). Used to prefill the "Hours worked" field on wage
 * settlements — the operator can still edit the number before saving.
 *
 * A shift counts when it STARTS inside the period. Dates are interpreted in the
 * fleet's time zone (Malta), not UTC, so a 00:30 clock-in lands on the right
 * day. Shifts still open count up to now (capped at 24h — the hourly cron
 * auto-closes anything older) so a period that ends today isn't under-counted.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminOrStaff(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const driverId = searchParams.get('driver_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!driverId || !from || !to) {
      return NextResponse.json({ error: 'driver_id, from and to are required' }, { status: 400 });
    }
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || to < from) {
      return NextResponse.json({ error: 'from/to must be YYYY-MM-DD with to >= from' }, { status: 400 });
    }

    const supabase = await createClient();

    // The driver must belong to the caller's ACTIVE fleet — RLS alone would
    // also resolve a driver from any other fleet the caller is a member of.
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .eq('organization_id', session.organization_id)
      .maybeSingle();
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Query a day wider than the period in UTC, then keep the shifts whose
    // LOCAL start date falls inside it.
    const lower = new Date(`${from}T00:00:00Z`);
    lower.setUTCDate(lower.getUTCDate() - 1);
    const upper = new Date(`${to}T00:00:00Z`);
    upper.setUTCDate(upper.getUTCDate() + 2);

    const { data: shifts, error } = await supabase
      .from('driver_shifts')
      .select('start_time, end_time')
      .eq('driver_id', driverId)
      .eq('organization_id', session.organization_id)
      .gte('start_time', lower.toISOString())
      .lt('start_time', upper.toISOString());

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = Date.now();
    let totalMs = 0;
    let counted = 0;
    let openShifts = 0;
    for (const s of shifts || []) {
      const day = localDate(s.start_time);
      if (day < from || day > to) continue;
      const start = new Date(s.start_time).getTime();
      let end: number;
      if (s.end_time) {
        end = new Date(s.end_time).getTime();
      } else {
        openShifts++;
        end = Math.min(now, start + OPEN_SHIFT_CAP_MS);
      }
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        totalMs += end - start;
        counted++;
      }
    }

    return NextResponse.json({
      hours: round2(totalMs / 3_600_000),
      shifts: counted,
      open_shifts: openShifts,
    });
  } catch (error) {
    console.error('Error computing shift hours:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
