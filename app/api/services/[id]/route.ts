import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/services/[id]
 * Get a single service record
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: service, error } = await supabase
    .from('vehicle_services')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .eq('id', id)
    .single();

  if (error || !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  }

  return NextResponse.json({ data: service });
}

/**
 * PUT /api/services/[id]
 * Update a service record
 */
export async function PUT(request: Request, { params }: RouteParams) {
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

  const body = await request.json();

  const { data: service, error } = await supabase
    .from('vehicle_services')
    .update({
      service_date: body.service_date,
      service_type: body.service_type,
      mileage_at_service: body.mileage_at_service,
      next_service_mileage: body.next_service_mileage || null,
      next_service_date: body.next_service_date || null,
      cost: body.cost || null,
      currency: body.currency || 'EUR',
      service_provider: body.service_provider || null,
      description: body.description || null,
      parts_replaced: body.parts_replaced || null,
      invoice_url: body.invoice_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: service });
}

/**
 * DELETE /api/services/[id]
 * Delete a service record
 */
export async function DELETE(request: Request, { params }: RouteParams) {
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
    .from('vehicle_services')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
