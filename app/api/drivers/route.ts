import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateDriverInput } from '@/lib/types/database';

/**
 * GET /api/drivers - List all drivers
 * Requires admin or staff role
 */
export async function GET() {
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

    if (!profile || !['admin', 'staff'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch drivers
    const { data: drivers, error } = await supabase
      .from('drivers')
      .select(`
        *,
        users:user_id (email),
        vehicles:assigned_vehicle_id (id, registration_number, make, model)
      `)
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
 * POST /api/drivers - Create a new driver
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

    // Check role - only admin can create drivers
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    // Create driver
    const { data: driver, error } = await supabase
      .from('drivers')
      .insert({
        user_id: body.user_id,
        full_name: body.full_name,
        phone: body.phone,
        address: body.address,
        status: body.status || 'active',
        assigned_vehicle_id: body.assigned_vehicle_id,
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

    return NextResponse.json({ data: driver }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
