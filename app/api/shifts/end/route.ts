import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

/**
 * POST /api/shifts/end
 *
 * Ends the authenticated driver's currently-open shift (in the ACTIVE fleet) and
 * turns off their live location tracking flag.
 *
 * Body (JSON, all optional — legacy one-tap callers send none):
 *   ending_mileage   closing odometer reading; must be >= the shift's starting
 *                    mileage. Also moves the vehicle's odometer forward.
 *   end_image_urls   up to 12 closing photos already uploaded to shift-images.
 *
 * Drivers don't have RLS update rights on driver_shifts, so the write goes
 * through the service-role client after we verify the shift belongs to the
 * caller's driver row in their active fleet.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Optional body.
    let body: { ending_mileage?: unknown; end_image_urls?: unknown } = {};
    try {
      const text = await request.text();
      if (text.trim()) body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawKm = body.ending_mileage;
    const endingMileage =
      rawKm === undefined || rawKm === null || rawKm === '' ? null : Number(rawKm);
    if (endingMileage !== null && (!Number.isInteger(endingMileage) || endingMileage < 0)) {
      return NextResponse.json({ error: 'ending_mileage must be a whole number of km' }, { status: 400 });
    }
    const endImageUrls = Array.isArray(body.end_image_urls)
      ? (body.end_image_urls as unknown[])
          .filter((u): u is string => typeof u === 'string' && u.length > 0 && u.length < 2048)
          .slice(0, 12)
      : [];

    const admin = createAdminClient();
    const orgId = session.organization_id;

    // Resolve the driver profile for this user IN THE ACTIVE FLEET. A driver who
    // works for two fleets has two rows; a bare user_id lookup errored on
    // .single() and they could never end a shift.
    const { data: driver, error: driverError } = await admin
      .from('drivers')
      .select('id')
      .eq('user_id', session.id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (driverError || !driver) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    // Find the open shift.
    const { data: activeShift } = await admin
      .from('driver_shifts')
      .select('id, vehicle_id, starting_mileage')
      .eq('driver_id', driver.id)
      .eq('organization_id', orgId)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeShift) {
      return NextResponse.json({ error: 'No active shift to end' }, { status: 404 });
    }

    if (endingMileage !== null && endingMileage < activeShift.starting_mileage) {
      return NextResponse.json(
        {
          error: `Ending mileage cannot be lower than the starting mileage (${activeShift.starting_mileage.toLocaleString()} km)`,
          starting_mileage: activeShift.starting_mileage,
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = { end_time: nowIso };
    if (endingMileage !== null) update.ending_mileage = endingMileage;
    if (endImageUrls.length > 0) update.end_image_urls = endImageUrls;

    const { error: updateError } = await admin
      .from('driver_shifts')
      .update(update)
      .eq('id', activeShift.id)
      .eq('organization_id', orgId);

    if (updateError) {
      console.error('Failed to end shift:', updateError);
      return NextResponse.json(
        { error: 'Failed to end shift', details: updateError.message },
        { status: 500 }
      );
    }

    // Vehicle odometer only ever moves forward.
    if (endingMileage !== null) {
      const { data: vehicle } = await admin
        .from('vehicles')
        .select('id, mileage')
        .eq('id', activeShift.vehicle_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (vehicle && (vehicle.mileage == null || endingMileage > Number(vehicle.mileage))) {
        await admin
          .from('vehicles')
          .update({ mileage: endingMileage })
          .eq('id', vehicle.id)
          .eq('organization_id', orgId);
      }
    }

    // Stop live tracking for this driver (best effort — the native app also
    // stops its background task via the message bridge).
    await admin
      .from('driver_positions')
      .update({ is_tracking: false })
      .eq('driver_id', driver.id);

    return NextResponse.json({
      success: true,
      shift_id: activeShift.id,
      ended_at: nowIso,
      ending_mileage: endingMileage,
    });
  } catch (error) {
    console.error('Error ending shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
