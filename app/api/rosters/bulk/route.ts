import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

/**
 * DELETE /api/rosters/bulk
 * Bulk delete rosters (and their associated entries)
 */
export async function DELETE(request: Request) {
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
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No roster IDs provided' }, { status: 400 });
  }

  const { data: existingRosters } = await supabase
    .from('rosters')
    .select('id, title')
    .in('id', ids);

  // Delete roster entries first (if they exist)
  await supabase
    .from('roster_entries')
    .delete()
    .in('roster_id', ids);

  // Delete rosters
  const { error } = await supabase
    .from('rosters')
    .delete()
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await createAuditLogEntry({
    actor,
    action: 'delete',
    entityType: 'roster_bulk',
    entityId: null,
    summary: `Deleted ${ids.length} roster${ids.length === 1 ? '' : 's'}`,
    details: {
      ids,
      titles: (existingRosters || []).map((roster) => roster.title),
      count: ids.length,
    },
  });

  return NextResponse.json({ 
    success: true, 
    deleted: ids.length 
  });
}
