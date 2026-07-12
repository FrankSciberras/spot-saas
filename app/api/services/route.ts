import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

/**
 * GET /api/services
 * List all vehicle services with optional filtering
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get('vehicle_id');
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = supabase
    .from('vehicle_services')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .order('service_date', { ascending: false })
    .limit(limit);

  if (vehicleId) {
    query = query.eq('vehicle_id', vehicleId);
  }

  const { data: services, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: services });
}

/**
 * POST /api/services
 * Create a new vehicle service record
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Gate on the caller's role in their ACTIVE fleet (memberships.role — the
  // same thing RLS checks), not the legacy global users.role.
  const session = await getSession();
  if (!session || !isAdminOrStaff(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const actor = await getAuditActor(user.id);

  const body = await request.json();
  const {
    vehicle_id,
    service_date,
    service_type,
    mileage_at_service,
    next_service_mileage,
    next_service_date,
    cost,
    currency,
    service_provider,
    description,
    parts_replaced,
    invoice_url,
  } = body;

  if (!vehicle_id || !service_date || !mileage_at_service) {
    return NextResponse.json({ 
      error: 'Vehicle, service date, and mileage are required' 
    }, { status: 400 });
  }

  // A service belongs to the same fleet as its vehicle. Look up that org so we
  // can stamp organization_id explicitly — the DB auto-stamp trigger leaves it
  // NULL for multi-fleet users, which then fails RLS WITH CHECK. This SELECT is
  // also RLS-scoped, so it confirms the caller may touch this vehicle.
  const { data: vehicleOrg } = await supabase
    .from('vehicles')
    .select('organization_id')
    .eq('id', vehicle_id)
    .single();
  if (!vehicleOrg) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
  }

  const { data: service, error } = await supabase
    .from('vehicle_services')
    .insert({
      organization_id: vehicleOrg.organization_id,
      vehicle_id,
      service_date,
      service_type: service_type || 'other',
      mileage_at_service,
      next_service_mileage: next_service_mileage || null,
      next_service_date: next_service_date || null,
      cost: cost || null,
      currency: currency || 'EUR',
      service_provider: service_provider || null,
      description: description || null,
      parts_replaced: parts_replaced || null,
      invoice_url: invoice_url || null,
      created_by: user.id,
    })
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update vehicle mileage to the service mileage (always update to latest known mileage)
  const { data: currentVehicle } = await supabase
    .from('vehicles')
    .select('mileage')
    .eq('id', vehicle_id)
    .single();
  
  // Update if current mileage is null, 0, or less than the service mileage
  if (!currentVehicle?.mileage || currentVehicle.mileage < mileage_at_service) {
    await supabase
      .from('vehicles')
      .update({ mileage: mileage_at_service })
      .eq('id', vehicle_id);
  }

  // Clear any existing service due notifications for this vehicle
  // (since we just added a new service, old alerts are outdated)
  if (next_service_mileage) {
    await supabase
      .from('notifications')
      .delete()
      .eq('action_url', `/fleet/vehicles/${vehicle_id}`)
      .ilike('title', '%Service%');
  }

  await createAuditLogEntry({
    actor,
    action: 'create',
    entityType: 'vehicle_service',
    entityId: service.id,
    summary: `Created service record for ${service.vehicles?.registration_number || vehicle_id}`,
    details: {
      vehicle_id,
      registration_number: service.vehicles?.registration_number || null,
      service_type: service.service_type,
      service_date: service.service_date,
      mileage_at_service: service.mileage_at_service,
    },
  });

  return NextResponse.json({ data: service }, { status: 201 });
}
