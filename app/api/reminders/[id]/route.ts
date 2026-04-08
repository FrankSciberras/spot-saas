import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { getSession } from '@/lib/auth/session';
import { getResourcePermissionsForUser } from '@/lib/permissions';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/reminders/:id — update a reminder
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permissions = await getResourcePermissionsForUser(session, 'reminders');
    if (!permissions.can_edit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const actor = await getAuditActor(session.id);

    const { data: existingReminder } = await supabase
      .from('reminders')
      .select('id, created_by, assigned_to')
      .eq('id', id)
      .maybeSingle();

    if (!existingReminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    if (
      session.role !== 'admin' &&
      existingReminder.created_by !== session.id &&
      existingReminder.assigned_to !== session.id
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const allowed = ['title', 'description', 'priority', 'status', 'assigned_to', 'due_date', 'remind_at', 'recurring', 'recurring_end_date'];
    for (const key of allowed) {
      if (key in body) updates[key] = body[key] ?? null;
    }

    // If marking completed, set completed_at
    if (body.status === 'completed') {
      updates.completed_at = new Date().toISOString();
    } else if (body.status && body.status !== 'completed') {
      updates.completed_at = null;
    }

    // If remind_at changed, reset reminder_sent
    if ('remind_at' in body) {
      updates.reminder_sent = false;
    }

    const { data, error } = await supabase
      .from('reminders')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        creator:created_by (full_name, email),
        assignee:assigned_to (full_name, email)
      `)
      .single();

    if (error) throw error;

    await createAuditLogEntry({
      actor,
      action: 'update',
      entityType: 'reminder',
      entityId: data.id,
      summary: `Updated reminder \"${data.title}\"`,
      details: {
        changed_fields: Object.keys(body),
        status: data.status,
        priority: data.priority,
        assigned_to: data.assigned_to,
      },
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error('PUT /api/reminders/:id error:', err);
    return NextResponse.json({ error: 'Failed to update reminder' }, { status: 500 });
  }
}

/**
 * DELETE /api/reminders/:id — delete a reminder
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permissions = await getResourcePermissionsForUser(session, 'reminders');
    if (!permissions.can_delete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const actor = await getAuditActor(session.id);

    const { data: existingReminder } = await supabase
      .from('reminders')
      .select('id, title, created_by, assigned_to, status')
      .eq('id', id)
      .maybeSingle();

    if (!existingReminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    if (
      session.role !== 'admin' &&
      existingReminder.created_by !== session.id &&
      existingReminder.assigned_to !== session.id
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await createAuditLogEntry({
      actor,
      action: 'delete',
      entityType: 'reminder',
      entityId: id,
      summary: `Deleted reminder \"${existingReminder?.title || id}\"`,
      details: {
        title: existingReminder?.title || null,
        assigned_to: existingReminder?.assigned_to || null,
        status: existingReminder?.status || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/reminders/:id error:', err);
    return NextResponse.json({ error: 'Failed to delete reminder' }, { status: 500 });
  }
}
