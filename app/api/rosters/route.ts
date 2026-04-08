import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor, hasStaffDashboardAccess } from '@/lib/audit/log';

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

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile && ['admin', 'staff'].includes(profile.role);

  let query = supabase
    .from('rosters')
    .select('*')
    .order('week_start', { ascending: false });

  // Non-admins only see published rosters
  if (!isAdmin) {
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

  const actor = await getAuditActor(user.id);

  if (!hasStaffDashboardAccess(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
