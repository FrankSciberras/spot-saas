import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { archiveDriver, restoreDriver } from '@/lib/members/archiveDriver';
import { checkCapacityToAdd } from '@/lib/billing/fleet-billing';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/drivers/[id]/archive — archive a driver: they lose access, the
 * fleet keeps their earnings, shifts and stats. Admins only.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const result = await archiveDriver({
    driverId: id,
    organizationId: session.organization_id,
    actingUserId: session.id,
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  await createAuditLogEntry({
    actor: await getAuditActor(session.id),
    organizationId: session.organization_id,
    action: 'update',
    entityType: 'driver',
    entityId: id,
    summary: `Archived driver ${result.driverName ?? ''}`.trim(),
    details: { archived: true, loginBlocked: result.loginBlocked ?? false },
  });

  return NextResponse.json({ success: true, loginBlocked: result.loginBlocked ?? false });
}

/**
 * DELETE /api/drivers/[id]/archive — restore an archived driver (gives their
 * access back). Counts toward the plan's driver limit again, so it is checked.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const capacity = await checkCapacityToAdd(session.organization_id, 'drivers');
  if (!capacity.ok) {
    return NextResponse.json({ error: capacity.message, code: 'plan_limit', required_plan: capacity.requiredPlan }, { status: 402 });
  }

  const result = await restoreDriver({ driverId: id, organizationId: session.organization_id });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  await createAuditLogEntry({
    actor: await getAuditActor(session.id),
    organizationId: session.organization_id,
    action: 'update',
    entityType: 'driver',
    entityId: id,
    summary: `Restored archived driver ${result.driverName ?? ''}`.trim(),
    details: { archived: false },
  });

  return NextResponse.json({ success: true });
}
