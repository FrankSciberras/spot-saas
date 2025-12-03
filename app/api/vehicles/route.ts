import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateVehicleInput } from '@/lib/types/database';

/**
 * GET /api/vehicles - List all vehicles
 */
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch vehicles
    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select(`
        *,
        drivers:assigned_driver_id (id, full_name)
      `)
      .order('registration_number');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: vehicles });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vehicles - Create a new vehicle
 * Requires admin role
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    const body: CreateVehicleInput = await request.json();

    // Validate required fields
    if (!body.registration_number || !body.make || !body.model) {
      return NextResponse.json(
        { error: 'registration_number, make, and model are required' },
        { status: 400 }
      );
    }

    // Create vehicle
    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert({
        registration_number: body.registration_number,
        make: body.make,
        model: body.model,
        year: body.year,
        mileage: body.mileage || 0,
        status: body.status || 'active',
        assigned_driver_id: body.assigned_driver_id,
        insurance_expiry_date: body.insurance_expiry_date,
        road_license_expiry_date: body.road_license_expiry_date,
        color: body.color,
        notes: body.notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: vehicle }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
