import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/shifts/[id] — correct a shift's recorded data (admin or staff of the
 * shift's fleet).
 *
 * The edit page used to write to driver_shifts straight from the browser. RLS
 * only lets ADMINS update shifts, so a staff member's edit silently matched zero
 * rows while the page still said "Shift updated successfully". The write now
 * runs here under the service role after the caller's fleet role is checked.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminOrStaff(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const orgId = session.organization_id;
    const admin = createAdminClient();

    // Active-fleet scope: the admin client bypasses RLS entirely.
    const { data: existing } = await admin
      .from('driver_shifts')
      .select('id, driver_id, starting_mileage, ending_mileage, start_time, end_time')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 120) {
        return NextResponse.json({ error: 'Name is required (max 120 characters)' }, { status: 400 });
      }
      update.name = name;
    }

    if (body.starting_mileage !== undefined) {
      const km = Number(body.starting_mileage);
      if (!Number.isInteger(km) || km < 0) {
        return NextResponse.json({ error: 'Starting mileage must be a whole number of km' }, { status: 400 });
      }
      update.starting_mileage = km;
    }

    if (body.ending_mileage !== undefined) {
      if (body.ending_mileage === null || body.ending_mileage === '') {
        update.ending_mileage = null;
      } else {
        const km = Number(body.ending_mileage);
        if (!Number.isInteger(km) || km < 0) {
          return NextResponse.json({ error: 'Ending mileage must be a whole number of km' }, { status: 400 });
        }
        update.ending_mileage = km;
      }
    }

    if (body.start_time !== undefined) {
      const t = Date.parse(String(body.start_time));
      if (!Number.isFinite(t)) {
        return NextResponse.json({ error: 'Invalid start time' }, { status: 400 });
      }
      update.start_time = new Date(t).toISOString();
    }

    if (body.end_time !== undefined) {
      if (body.end_time === null || body.end_time === '') {
        update.end_time = null;
      } else {
        const t = Date.parse(String(body.end_time));
        if (!Number.isFinite(t)) {
          return NextResponse.json({ error: 'Invalid end time' }, { status: 400 });
        }
        update.end_time = new Date(t).toISOString();
      }
    }

    if (typeof body.dashcam_checked === 'boolean') update.dashcam_checked = body.dashcam_checked;
    if (typeof body.car_internal_checked === 'boolean') update.car_internal_checked = body.car_internal_checked;

    if (body.notes !== undefined) {
      update.notes =
        body.notes === null || body.notes === '' ? null : String(body.notes).slice(0, 5000);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // Cross-field sanity on the RESULTING row.
    const finalStart = (update.start_time as string | undefined) ?? existing.start_time;
    const finalEnd =
      update.end_time !== undefined ? (update.end_time as string | null) : existing.end_time;
    if (finalEnd && Date.parse(finalEnd) < Date.parse(finalStart)) {
      return NextResponse.json({ error: 'End time cannot be before the start time' }, { status: 400 });
    }
    const finalStartKm = (update.starting_mileage as number | undefined) ?? existing.starting_mileage;
    const finalEndKm =
      update.ending_mileage !== undefined
        ? (update.ending_mileage as number | null)
        : (existing.ending_mileage as number | null);
    if (finalEndKm !== null && finalEndKm !== undefined && finalEndKm < finalStartKm) {
      return NextResponse.json(
        { error: 'Ending mileage cannot be lower than the starting mileage' },
        { status: 400 }
      );
    }

    // Re-opening a closed shift must not give the driver two open shifts.
    if (finalEnd === null && existing.end_time !== null) {
      const { data: otherOpen } = await admin
        .from('driver_shifts')
        .select('id')
        .eq('driver_id', existing.driver_id)
        .eq('organization_id', orgId)
        .is('end_time', null)
        .neq('id', id)
        .limit(1)
        .maybeSingle();
      if (otherOpen) {
        return NextResponse.json(
          { error: 'This driver already has another open shift. End that one first.' },
          { status: 409 }
        );
      }
    }

    const { data: updated, error } = await admin
      .from('driver_shifts')
      .update(update)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) {
      // 23505 = the one-open-shift-per-driver unique index.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'This driver already has another open shift. End that one first.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const actor = await getAuditActor(session.id);
    await createAuditLogEntry({
      actor,
      organizationId: orgId,
      action: 'update',
      entityType: 'driver_shift',
      entityId: id,
      summary: 'Edited shift record',
      details: { fields: Object.keys(update) },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
