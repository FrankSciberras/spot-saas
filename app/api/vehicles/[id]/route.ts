import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

    return NextResponse.json({ data: vehicle });
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

    const body: UpdateVehicleInput = await request.json();

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .update({
        registration_number: body.registration_number,
        make: body.make,
        model: body.model,
        year: body.year,
        mileage: body.mileage,
        status: body.status,
        assigned_driver_id: body.assigned_driver_id,
        insurance_expiry_date: body.insurance_expiry_date,
        road_license_expiry_date: body.road_license_expiry_date,
        color: body.color,
        notes: body.notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
