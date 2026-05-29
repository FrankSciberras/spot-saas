import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { getSession } from '@/lib/auth/session';
import { getResourcePermissionsForUser } from '@/lib/permissions';

/**
 * GET /api/reminders — list reminders (admin sees all, staff sees own)
 * Query params: status, priority, assigned_to
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permissions = await getResourcePermissionsForUser(session, 'reminders');
    if (!permissions.can_view) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assigned_to');

    let query = supabase
      .from('reminders')
      .select(`
        *,
        creator:created_by (full_name, email),
        assignee:assigned_to (full_name, email)
      `)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (session.role !== 'admin') {
      query = query.or(`created_by.eq.${session.id},assigned_to.eq.${session.id}`);
    }

    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['pending', 'in_progress']);
      } else {
        query = query.eq('status', status);
      }
    }
    if (priority) query = query.eq('priority', priority);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('GET /api/reminders error:', err);
    return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 });
  }
}

/**
 * POST /api/reminders — create a new reminder
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permissions = await getResourcePermissionsForUser(session, 'reminders');
    if (!permissions.can_create) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const actor = await getAuditActor(session.id);

    const body = await request.json();
    const { title, description, priority, assigned_to, due_date, remind_at, recurring, recurring_end_date } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        organization_id: session.organization_id,
        created_by: session.id,
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        assigned_to: assigned_to || null,
        due_date: due_date || null,
        remind_at: remind_at || null,
        recurring: recurring || null,
        recurring_end_date: recurring_end_date || null,
      })
      .select(`
        *,
        creator:created_by (full_name, email),
        assignee:assigned_to (full_name, email)
      `)
      .single();

    if (error) throw error;

    await createAuditLogEntry({
      actor,
      organizationId: session.organization_id,
      action: 'create',
      entityType: 'reminder',
      entityId: data.id,
      summary: `Created reminder \"${data.title}\"`,
      details: {
        title: data.title,
        assigned_to: data.assigned_to,
        priority: data.priority,
        due_date: data.due_date,
      },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/reminders error:', err);
    return NextResponse.json({ error: 'Failed to create reminder' }, { status: 500 });
  }
}
