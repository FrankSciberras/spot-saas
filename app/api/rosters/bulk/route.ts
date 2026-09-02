import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

/**
 * DELETE /api/rosters/bulk
 * Bulk delete rosters (their assignments follow via ON DELETE CASCADE)
 */
export async function DELETE(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Deleting rosters is ADMIN-only — the same gate as the single-roster DELETE —
  // resolved from the caller's role in their ACTIVE fleet.
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const actor = await getAuditActor(session.id);

  const body = await request.json();
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No roster IDs provided' }, { status: 400 });
  }

  const { data: existingRosters } = await supabase
    .from('rosters')
    .select('id, title')
    .in('id', ids)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id);

  // Delete rosters. roster_assignments.roster_id is ON DELETE CASCADE, so the
  // database removes the child rows — no separate child delete is needed.
  const { error } = await supabase
    .from('rosters')
    .delete()
    .in('id', ids)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id);

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
