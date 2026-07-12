import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import type { UpdateDamageInput } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string; damageId: string }>;
}

/**
 * GET /api/vehicles/[id]/damages/[damageId] - Get a single damage record
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id, damageId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: damage, error } = await supabase
      .from('vehicle_damages')
      .select(`
        *,
        reporter:reported_by (full_name, email)
      `)
      .eq('id', damageId)
      .eq('vehicle_id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ data: damage });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/vehicles/[id]/damages/[damageId] - Update a damage record
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id, damageId } = await params;
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

    const body: UpdateDamageInput = await request.json();

    const { data: existingDamage } = await supabase
      .from('vehicle_damages')
      .select('id, zone, severity, status')
      .eq('id', damageId)
      .eq('vehicle_id', id)
      .single();

    const updateData: Record<string, unknown> = {};
    if (body.zone !== undefined) updateData.zone = body.zone;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.severity !== undefined) updateData.severity = body.severity;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.repair_cost !== undefined) updateData.repair_cost = body.repair_cost;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.images !== undefined) updateData.images = body.images;
    if (body.repaired_at !== undefined) updateData.repaired_at = body.repaired_at;
    if (body.notes !== undefined) updateData.notes = body.notes;
    updateData.updated_at = new Date().toISOString();

    const { data: damage, error } = await supabase
      .from('vehicle_damages')
      .update(updateData)
      .eq('id', damageId)
      .eq('vehicle_id', id)
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
      action: 'update',
      entityType: 'vehicle_damage',
      entityId: damageId,
      summary: `Updated vehicle damage on vehicle ${id}`,
      details: {
        vehicle_id: id,
        previous_zone: existingDamage?.zone || null,
        zone: damage.zone,
        previous_status: existingDamage?.status || null,
        status: damage.status,
        changed_fields: Object.keys(body),
      },
    });

    return NextResponse.json({ data: damage });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/vehicles/[id]/damages/[damageId] - Delete a damage record
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id, damageId } = await params;
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('vehicle_damages')
      .delete()
      .eq('id', damageId)
      .eq('vehicle_id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
