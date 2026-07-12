import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import type { CreateDamageInput } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/vehicles/[id]/damages - List all damages for a vehicle
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: damages, error } = await supabase
      .from('vehicle_damages')
      .select(`
        *,
        reporter:reported_by (full_name, email)
      `)
      .eq('vehicle_id', id)
      .order('reported_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: damages });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/vehicles/[id]/damages - Create a new damage record
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    const body: CreateDamageInput = await request.json();

    if (!body.zone) {
      return NextResponse.json(
        { error: 'zone is required' },
        { status: 400 }
      );
    }

    // A damage record belongs to the same fleet as its vehicle. Look that org up
    // so we can stamp organization_id explicitly — the DB auto-stamp trigger
    // leaves it NULL for multi-fleet users, which then fails RLS WITH CHECK.
    const { data: vehicleOrg } = await supabase
      .from('vehicles')
      .select('organization_id')
      .eq('id', id)
      .single();
    if (!vehicleOrg) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const { data: damage, error } = await supabase
      .from('vehicle_damages')
      .insert({
        organization_id: vehicleOrg.organization_id,
        vehicle_id: id,
        zone: body.zone,
        description: body.description || '',
        severity: body.severity || 'minor',
        status: body.status || 'open',
        repair_cost: body.repair_cost || null,
        currency: body.currency || 'EUR',
        images: body.images || [],
        reported_by: user.id,
        notes: body.notes || null,
      })
      .select(`
        *,
        reporter:reported_by (full_name, email)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await createAuditLogEntry({
      actor,
      action: 'create',
      entityType: 'vehicle_damage',
      entityId: damage.id,
      summary: `Reported vehicle damage on vehicle ${id}`,
      details: {
        vehicle_id: id,
        zone: damage.zone,
        severity: damage.severity,
        status: damage.status,
      },
    });

    return NextResponse.json({ data: damage }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
