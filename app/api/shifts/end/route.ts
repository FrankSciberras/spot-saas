import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

/**
 * POST /api/shifts/end
 *
 * Ends the authenticated driver's currently-active shift (the most recent one
 * with no end_time) and turns off their live location tracking flag.
 *
 * Drivers don't have RLS update rights on driver_shifts, so the write goes
 * through the service-role client after we verify the shift belongs to the
 * caller. Mirrors the approach used by /api/vehicles/[id]/mileage.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Resolve the driver profile for this user IN THE ACTIVE FLEET. A driver who
    // works for two fleets has two rows; the old bare user_id lookup errored on
    // .single() and they could never end a shift.
    const { data: driver, error: driverError } = await admin
      .from('drivers')
      .select('id')
      .eq('user_id', session.id)
      .eq('organization_id', session.organization_id)
      .maybeSingle();

    if (driverError || !driver) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    // Find the active (open) shift.
    const { data: activeShift } = await admin
      .from('driver_shifts')
      .select('id')
      .eq('driver_id', driver.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeShift) {
      return NextResponse.json({ error: 'No active shift to end' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await admin
      .from('driver_shifts')
      .update({ end_time: nowIso })
      .eq('id', activeShift.id);

    if (updateError) {
      console.error('Failed to end shift:', updateError);
      return NextResponse.json(
        { error: 'Failed to end shift', details: updateError.message },
        { status: 500 }
      );
    }

    // Stop live tracking for this driver (best effort — the native app also
    // stops its background task via the message bridge).
    await admin
      .from('driver_positions')
      .update({ is_tracking: false })
      .eq('driver_id', driver.id);

    return NextResponse.json({ success: true, shift_id: activeShift.id, ended_at: nowIso });
  } catch (error) {
    console.error('Error ending shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
