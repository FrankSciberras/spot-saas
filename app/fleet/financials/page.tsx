import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import FinancialsDashboard from '@/components/admin/FinancialsDashboard';

export default async function FinancialsPage() {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'bookkeeping');
  return (
    <FleetShell user={user} title="Financials">
      <Suspense fallback={<FleetPageSkeleton variant="board" />}>
        <FinancialsContent orgId={user.organization_id} />
      </Suspense>
    </FleetShell>
  );
}

async function FinancialsContent({ orgId }: { orgId: string }) {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from('weekly_bookkeeping')
    .select('*')
    .eq('organization_id', orgId)
    .order('week_start', { ascending: true });

  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, status')
    .eq('organization_id', orgId)
    .order('full_name');

  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      drivers:driver_id (id, full_name, status),
      settlement_platforms (*)
    `)
    .eq('organization_id', orgId)
    .order('week_start', { ascending: true });

  return <FinancialsDashboard entries={entries || []} drivers={drivers || []} settlements={settlements || []} />;
}
