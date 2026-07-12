import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

/**
 * GET /api/rosters
 * List all rosters (admins see all, drivers see only published)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Draft visibility follows the caller's role in their ACTIVE fleet
  // (memberships.role — the same thing RLS checks), not the legacy global
  // users.role, which can differ when someone belongs to several fleets.
  const session = await getSession();
  const hasStaffAccess = !!session && isAdminOrStaff(session);

  let query = supabase
    .from('rosters')
    .select('*')
    .order('week_start', { ascending: false });

  // Non-staff users only see published rosters
  if (!hasStaffAccess) {
    query = query.eq('status', 'published');
  }

  const { data: rosters, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: rosters });
}

/**
 * POST /api/rosters
 * Create a new roster
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
  if (!session) {
    return NextResponse.json({ error: 'No active fleet' }, { status: 400 });
  }
  if (!isAdminOrStaff(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const actor = await getAuditActor(user.id);

  // Stamp the caller's active fleet explicitly — the DB auto-stamp trigger leaves
  // organization_id NULL for multi-fleet users, which then fails RLS WITH CHECK.
  const orgId = session.organization_id;

  const body = await request.json();
  const { week_start, title, notes } = body;

  if (!week_start) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 });
  }

  // Calculate week_end (6 days after week_start)
  const startDate = new Date(week_start);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const { data: roster, error } = await supabase
    .from('rosters')
    .insert({
      organization_id: orgId,
      week_start,
      week_end: endDate.toISOString().split('T')[0],
      title: title || generateRosterTitle(startDate, endDate),
      notes,
      created_by: user.id,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A roster for this week already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createAuditLogEntry({
    actor,
    action: 'create',
    entityType: 'roster',
    entityId: roster.id,
    summary: `Created roster \"${roster.title}\"`,
    details: {
      week_start: roster.week_start,
      week_end: roster.week_end,
      status: roster.status,
    },
  });

  return NextResponse.json({ data: roster }, { status: 201 });
}

function generateRosterTitle(start: Date, end: Date): string {
  const startDay = start.getDate();
  const endDay = end.getDate();
  const month = start.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${startDay}-${endDay} ${month}`;
}
