import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { UpdateVehicleInput } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/vehicles/[id] - Get a single vehicle
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        drivers:assigned_driver_id (id, full_name, phone)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const { data: assignments } = await supabase
      .from('driver_vehicle_assignments')
      .select(`
        driver_id,
        drivers:driver_id (id, full_name, phone)
      `)
      .eq('vehicle_id', id);

    const normalizeDriver = (d: unknown): { id: string; full_name: string; phone?: string | null } | null => {
      if (!d) return null;
      if (Array.isArray(d)) return (d[0] as { id: string; full_name: string; phone?: string | null } | undefined) || null;
      return d as { id: string; full_name: string; phone?: string | null };
    };

    const typedAssignments = (assignments || []) as Array<{ driver_id?: string | null; drivers?: unknown }>;

    const assignedDrivers = typedAssignments
      .map((a) => normalizeDriver(a.drivers))
      .filter(Boolean);

    const assignedDriverIds = typedAssignments
      .map((a) => a.driver_id || null)
      .filter(Boolean);

    return NextResponse.json({
      data: {
        ...vehicle,
        assigned_driver_ids: assignedDriverIds,
        assigned_drivers: assignedDrivers,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/vehicles/[id] - Update a vehicle
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: UpdateVehicleInput = await request.json();

    const requestedDriverIds = body.assigned_driver_ids;

    const updateData: Record<string, unknown> = {};
    if (body.registration_number !== undefined) updateData.registration_number = body.registration_number;
    if (body.make !== undefined) updateData.make = body.make;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.year !== undefined) updateData.year = body.year;
    if (body.mileage !== undefined) updateData.mileage = body.mileage;
    if (body.status !== undefined) updateData.status = body.status;
    if (requestedDriverIds !== undefined) {
      updateData.assigned_driver_id = requestedDriverIds[0] || null;
    } else if (body.assigned_driver_id !== undefined) {
      updateData.assigned_driver_id = body.assigned_driver_id;
    }
    if (body.insurance_expiry_date !== undefined) updateData.insurance_expiry_date = body.insurance_expiry_date;
    if (body.road_license_expiry_date !== undefined) updateData.road_license_expiry_date = body.road_license_expiry_date;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.vehicle_model_id !== undefined) updateData.vehicle_model_id = body.vehicle_model_id;
    updateData.updated_at = new Date().toISOString();

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (requestedDriverIds !== undefined) {
      const { error: deleteError } = await supabase
        .from('driver_vehicle_assignments')
        .delete()
        .eq('vehicle_id', id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      if (requestedDriverIds.length > 0) {
        const records = requestedDriverIds.map((driverId) => ({
          driver_id: driverId,
          vehicle_id: id,
        }));

        const { error: insertError } = await supabase
          .from('driver_vehicle_assignments')
          .insert(records);

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ data: vehicle });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/vehicles/[id] - Delete a vehicle
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('vehicles')
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
