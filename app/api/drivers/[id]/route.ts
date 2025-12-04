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

    return NextResponse.json({ data: driver });
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

    const { data: driver, error } = await supabase
      .from('drivers')
      .update({
        full_name: body.full_name,
        phone: body.phone,
        address: body.address,
        status: body.status,
        assigned_vehicle_id: body.assigned_vehicle_id,
        id_card_number: body.id_card_number,
        id_card_expiry_date: body.id_card_expiry_date,
        police_conduct_expiry_date: body.police_conduct_expiry_date,
        driving_license_number: body.driving_license_number,
        driving_license_expiry_date: body.driving_license_expiry_date,
        tag_license_expiry_date: body.tag_license_expiry_date,
        notes: body.notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
