import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import TripsWorkspace, { type TripDriver } from '@/components/fleet/tracking/TripsWorkspace';

export default async function TripsPage() {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'tracking');
  return (
    <FleetShell user={user} title="Trips">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <TripsContent orgId={user.organization_id} />
      </Suspense>
    </FleetShell>
  );
}

async function TripsContent({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('organization_id', orgId)
    .order('full_name', { ascending: true });

  const drivers: TripDriver[] = ((data || []) as any[]).map((d) => ({
    id: d.id,
    name: d.full_name || 'Unknown driver',
  }));

  return <TripsWorkspace orgId={orgId} drivers={drivers} />;
}
