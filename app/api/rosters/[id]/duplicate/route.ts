import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor, hasStaffDashboardAccess } from '@/lib/audit/log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/rosters/[id]/duplicate
 * "Copy last week" — clone a roster and all its assignments into a new DRAFT
 * roster for the following week (every date shifted +7 days). Lets operators
 * stop rebuilding identical weeks by hand.
 *
 * Everything runs on the RLS client, so the source roster is only readable if
 * it belongs to the caller's fleet, and organization_id is auto-stamped on the
 * new rows — no cross-tenant clone is possible.
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const actor = await getAuditActor(user.id);
  if (!hasStaffDashboardAccess(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // RLS-scoped read → only the caller's own fleet's roster resolves.
  const { data: source, error: srcError } = await supabase
    .from('rosters')
    .select('id, week_start, week_end, title, notes')
    .eq('id', id)
    .single();

  if (srcError || !source) {
    return NextResponse.json({ error: 'Roster not found' }, { status: 404 });
  }

  const newWeekStart = addDays(source.week_start, 7);
  const newWeekEnd = source.week_end ? addDays(source.week_end, 7) : addDays(newWeekStart, 6);

  // Create the new draft roster (organization_id auto-stamped).
  const { data: newRoster, error: insertError } = await supabase
    .from('rosters')
    .insert({
      week_start: newWeekStart,
      week_end: newWeekEnd,
      title: source.title ? `${source.title} (copy)` : null,
      notes: source.notes ?? null,
      created_by: user.id,
      status: 'draft',
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'A roster for the following week already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Clone the assignments, shifting each date by a week.
  const { data: assignments } = await supabase
    .from('roster_assignments')
    .select('vehicle_id, driver_id, assignment_date, day_of_week, notes')
    .eq('roster_id', id);

  let clonedCount = 0;
  if (assignments && assignments.length > 0) {
    const rows = assignments.map((a: {
      vehicle_id: string;
      driver_id: string | null;
      assignment_date: string;
      day_of_week: number;
      notes: string | null;
    }) => ({
      roster_id: newRoster.id,
      vehicle_id: a.vehicle_id,
      driver_id: a.driver_id,
      assignment_date: addDays(a.assignment_date, 7),
      day_of_week: a.day_of_week,
      notes: a.notes,
    }));

    const { error: cloneError } = await supabase.from('roster_assignments').insert(rows);
    if (cloneError) {
      // Roll back the empty roster so we don't leave an orphan on failure.
      await supabase.from('rosters').delete().eq('id', newRoster.id);
      return NextResponse.json({ error: cloneError.message }, { status: 500 });
    }
    clonedCount = rows.length;
  }

  await createAuditLogEntry({
    actor,
    action: 'create',
    entityType: 'roster',
    entityId: newRoster.id,
    summary: `Duplicated roster "${source.title || id}" to the following week`,
    details: {
      source_roster_id: id,
      week_start: newRoster.week_start,
      assignments_cloned: clonedCount,
    },
  });

  return NextResponse.json({ data: newRoster, assignments_cloned: clonedCount }, { status: 201 });
}
