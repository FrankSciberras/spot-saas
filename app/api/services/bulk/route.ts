import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

/**
 * DELETE /api/services/bulk
 * Bulk delete vehicle services
 */
export async function DELETE(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Deleting service records is ADMIN-only in RLS ("Admins delete services in
  // org"), so gate on the caller's admin role in their ACTIVE fleet — otherwise
  // staff would get a 200 while RLS silently deletes 0 rows.
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const actor = await getAuditActor(session.id);

  const body = await request.json();
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No service IDs provided' }, { status: 400 });
  }

  const { data: existingServices } = await supabase
    .from('vehicle_services')
    .select('id, vehicle_id, service_type')
    .in('id', ids)
    // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
    .eq('organization_id', session.organization_id);

  const { error } = await supabase
    .from('vehicle_services')
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
    entityType: 'vehicle_service_bulk',
    entityId: null,
    summary: `Deleted ${ids.length} service record${ids.length === 1 ? '' : 's'}`,
    details: {
      ids,
      count: ids.length,
      vehicle_ids: (existingServices || []).map((service) => service.vehicle_id),
      service_types: (existingServices || []).map((service) => service.service_type),
    },
  });

  return NextResponse.json({ 
    success: true, 
    deleted: ids.length 
  });
}
