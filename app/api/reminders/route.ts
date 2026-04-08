import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

/**
 * GET /api/reminders — list reminders (admin sees all, staff sees own)
 * Query params: status, priority, assigned_to
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const actor = await getAuditActor(user.id);

    const body = await request.json();
    const { title, description, priority, assigned_to, due_date, remind_at, recurring, recurring_end_date } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('reminders')
      .insert({
        created_by: user.id,
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
