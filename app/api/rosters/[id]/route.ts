import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/rosters/[id]
 * Get roster with all assignments
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  // Get roster
  const { data: roster, error: rosterError } = await supabase
    .from('rosters')
    .select('*')
    .eq('id', id)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id)
    .single();

  if (rosterError) {
    return NextResponse.json({ error: 'Roster not found' }, { status: 404 });
  }

  // Get assignments with vehicle and driver details
  const { data: assignments, error: assignmentsError } = await supabase
    .from('roster_assignments')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model),
      drivers:driver_id (id, full_name, phone),
      secondary_drivers:secondary_driver_id (id, full_name, phone)
    `)
    .eq('roster_id', id)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id)
    .order('assignment_date', { ascending: true });

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
  }

  return NextResponse.json({ 
    data: { 
      ...roster, 
      assignments: assignments || [] 
    } 
  });
}

/**
 * PUT /api/rosters/[id]
 * Update roster details or assignments
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Gate on the caller's role in their ACTIVE fleet (memberships.role — the
  // same thing RLS checks), not the legacy global users.role.
  if (!isAdminOrStaff(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const actor = await getAuditActor(session.id);

  const body = await request.json();
  const { title, notes, status, assignments } = body;

  const { data: existingRoster } = await supabase
    .from('rosters')
    .select('id, title, status, organization_id')
    .eq('id', id)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id)
    .single();

  // Resolve the roster BEFORE touching anything — otherwise the assignment
  // delete/insert below would run against an unknown roster and stamp the new
  // rows with organization_id undefined.
  if (!existingRoster) {
    return NextResponse.json({ error: 'Roster not found' }, { status: 404 });
  }

  // Update roster metadata
  if (title !== undefined || notes !== undefined || status !== undefined) {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'published') {
        updateData.published_at = new Date().toISOString();
      }
    }

    const { error: updateError } = await supabase
      .from('rosters')
      .update(updateData)
      .eq('id', id)
      // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
      .eq('organization_id', session.organization_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // Update assignments if provided
  if (assignments && Array.isArray(assignments)) {
    // Delete existing assignments
    await supabase
      .from('roster_assignments')
      .delete()
      .eq('roster_id', id)
      // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
      .eq('organization_id', session.organization_id);

    // Insert new assignments
    if (assignments.length > 0) {
      const assignmentRecords = assignments.map((a: {
        vehicle_id: string;
        driver_id: string | null;
        secondary_driver_id?: string | null;
        assignment_date: string;
        day_of_week: number;
      }) => ({
        // Stamp the parent roster's fleet explicitly — the DB auto-stamp trigger
        // leaves organization_id NULL for multi-fleet users, failing RLS.
        organization_id: existingRoster.organization_id,
        roster_id: id,
        vehicle_id: a.vehicle_id,
        driver_id: a.driver_id || null,
        secondary_driver_id: a.secondary_driver_id || null,
        assignment_date: a.assignment_date,
        day_of_week: a.day_of_week,
      }));

      const { error: insertError } = await supabase
        .from('roster_assignments')
        .insert(assignmentRecords);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
  }

  // Fetch updated roster
  const { data: roster } = await supabase
    .from('rosters')
    .select('*')
    .eq('id', id)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id)
    .single();

  await createAuditLogEntry({
    actor,
    action: 'update',
    entityType: 'roster',
    entityId: id,
    summary: `Updated roster \"${roster?.title || existingRoster?.title || id}\"`,
    details: {
      previous_status: existingRoster?.status || null,
      status: roster?.status || status || null,
      updated_fields: Object.keys(body),
      assignments_count: Array.isArray(assignments) ? assignments.length : undefined,
    },
  });

  return NextResponse.json({ data: roster });
}

/**
 * DELETE /api/rosters/[id]
 * Delete a roster
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const actor = await getAuditActor(session.id);

  const { data: existingRoster } = await supabase
    .from('rosters')
    .select('id, title, week_start, week_end, status')
    .eq('id', id)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id)
    .single();

  const { error } = await supabase
    .from('rosters')
    .delete()
    .eq('id', id)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createAuditLogEntry({
    actor,
    action: 'delete',
    entityType: 'roster',
    entityId: id,
    summary: `Deleted roster \"${existingRoster?.title || id}\"`,
    details: {
      title: existingRoster?.title || null,
      week_start: existingRoster?.week_start || null,
      week_end: existingRoster?.week_end || null,
      status: existingRoster?.status || null,
    },
  });

  return NextResponse.json({ success: true });
}
