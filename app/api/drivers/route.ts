import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { CreateDriverInput } from '@/lib/types/database';

/**
 * GET /api/drivers - List all drivers in the active fleet
 * Requires admin or staff role in the active org.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['admin', 'staff'].includes(session.role) && !session.also_staff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = await createClient();

    // RLS scopes this to the caller's org; the explicit filter is belt-and-braces.
    const { data: drivers, error } = await supabase
      .from('drivers')
      .select(`
        *,
        users:user_id (email),
        vehicles:assigned_vehicle_id (id, registration_number, make, model)
      `)
      .eq('organization_id', session.organization_id)
      .order('full_name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: drivers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/drivers - Create a new driver in the active fleet
 * Requires admin role in the active org.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only an admin of the active fleet can create drivers.
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orgId = session.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: 'No active fleet' }, { status: 400 });
    }

    // Parse request body
    const body: CreateDriverInput = await request.json();

    // Validate required fields
    if (!body.user_id || !body.full_name) {
      return NextResponse.json(
        { error: 'user_id and full_name are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Create driver — explicitly stamp organization_id so the insert satisfies
    // RLS WITH CHECK even for admins who belong to more than one fleet (where the
    // auto-stamp trigger intentionally leaves it NULL).
    const { data: driver, error } = await supabase
      .from('drivers')
      .insert({
        organization_id: orgId,
        user_id: body.user_id,
        full_name: body.full_name,
        phone: body.phone,
        address: body.address,
        status: body.status || 'active',
        employment_type: body.employment_type || null,
        assigned_vehicle_id: body.assigned_vehicle_ids?.[0] || body.assigned_vehicle_id,
        id_card_number: body.id_card_number,
        id_card_expiry_date: body.id_card_expiry_date,
        police_conduct_expiry_date: body.police_conduct_expiry_date,
        driving_license_number: body.driving_license_number,
        driving_license_expiry_date: body.driving_license_expiry_date,
        notes: body.notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const vehicleIds = body.assigned_vehicle_ids;
    if (vehicleIds && vehicleIds.length > 0) {
      const records = vehicleIds.map((vehicleId) => ({
        organization_id: orgId,
        driver_id: driver.id,
        vehicle_id: vehicleId,
      }));

      const { error: insertError } = await supabase
        .from('driver_vehicle_assignments')
        .insert(records);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ data: driver }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
