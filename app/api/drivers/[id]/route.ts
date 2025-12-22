import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { UpdateDriverInput } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/drivers/[id] - Get a single driver
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: driver, error } = await supabase
      .from('drivers')
      .select(`
        *,
        users:user_id (id, email, full_name),
        vehicles:assigned_vehicle_id (id, registration_number, make, model)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const { data: assignments } = await supabase
      .from('driver_vehicle_assignments')
      .select(`
        vehicle_id,
        vehicles:vehicle_id (id, registration_number, make, model)
      `)
      .eq('driver_id', id);

    const normalizeVehicle = (v: unknown): { id: string; registration_number: string; make: string; model: string } | null => {
      if (!v) return null;
      if (Array.isArray(v)) return (v[0] as { id: string; registration_number: string; make: string; model: string } | undefined) || null;
      return v as { id: string; registration_number: string; make: string; model: string };
    };

    const typedAssignments = (assignments || []) as Array<{ vehicle_id?: string | null; vehicles?: unknown }>;

    const assignedVehicles = typedAssignments
      .map((a) => normalizeVehicle(a.vehicles))
      .filter(Boolean);

    const assignedVehicleIds = typedAssignments
      .map((a) => a.vehicle_id || null)
      .filter(Boolean);

    return NextResponse.json({
      data: {
        ...driver,
        assigned_vehicle_ids: assignedVehicleIds,
        assigned_vehicles: assignedVehicles,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/drivers/[id] - Update a driver
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: UpdateDriverInput = await request.json();

    const requestedVehicleIds = body.assigned_vehicle_ids;

    const updateData: Record<string, unknown> = {};
    if (body.full_name !== undefined) updateData.full_name = body.full_name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.employment_type !== undefined) updateData.employment_type = body.employment_type;
    if (body.id_card_number !== undefined) updateData.id_card_number = body.id_card_number;
    if (body.id_card_expiry_date !== undefined) updateData.id_card_expiry_date = body.id_card_expiry_date;
    if (body.police_conduct_expiry_date !== undefined) updateData.police_conduct_expiry_date = body.police_conduct_expiry_date;
    if (body.driving_license_number !== undefined) updateData.driving_license_number = body.driving_license_number;
    if (body.driving_license_expiry_date !== undefined) updateData.driving_license_expiry_date = body.driving_license_expiry_date;
    if (body.tag_license_expiry_date !== undefined) updateData.tag_license_expiry_date = body.tag_license_expiry_date;
    if (body.notes !== undefined) updateData.notes = body.notes;

    if (requestedVehicleIds !== undefined) {
      updateData.assigned_vehicle_id = requestedVehicleIds[0] || null;
    } else if (body.assigned_vehicle_id !== undefined) {
      updateData.assigned_vehicle_id = body.assigned_vehicle_id;
    }

    updateData.updated_at = new Date().toISOString();

    const { data: driver, error } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (requestedVehicleIds !== undefined) {
      const { error: deleteError } = await supabase
        .from('driver_vehicle_assignments')
        .delete()
        .eq('driver_id', id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      if (requestedVehicleIds.length > 0) {
        const records = requestedVehicleIds.map((vehicleId) => ({
          driver_id: id,
          vehicle_id: vehicleId,
        }));

        const { error: insertError } = await supabase
          .from('driver_vehicle_assignments')
          .insert(records);

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ data: driver });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/drivers/[id] - Delete a driver
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('drivers')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
