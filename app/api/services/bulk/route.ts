import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor, hasStaffDashboardAccess } from '@/lib/audit/log';

/**
 * DELETE /api/services/bulk
 * Bulk delete vehicle services
 */
export async function DELETE(request: Request) {
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
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No service IDs provided' }, { status: 400 });
  }

  const { data: existingServices } = await supabase
    .from('vehicle_services')
    .select('id, vehicle_id, service_type')
    .in('id', ids);

  const { error } = await supabase
    .from('vehicle_services')
    .delete()
    .in('id', ids);

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
