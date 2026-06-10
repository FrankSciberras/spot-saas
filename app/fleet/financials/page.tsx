import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import FinancialsDashboard from '@/components/admin/FinancialsDashboard';

export default async function FinancialsPage() {
  const user = await requireRole(['admin']);
  return (
    <FleetShell user={user} title="Financials">
      <Suspense fallback={<FleetPageSkeleton variant="board" />}>
        <FinancialsContent />
      </Suspense>
    </FleetShell>
  );
}

async function FinancialsContent() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from('weekly_bookkeeping')
    .select('*')
    .order('week_start', { ascending: true });

  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, status')
    .order('full_name');

  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      drivers:driver_id (id, full_name, status),
      settlement_platforms (*)
    `)
    .order('week_start', { ascending: true });

  return <FinancialsDashboard entries={entries || []} drivers={drivers || []} settlements={settlements || []} />;
}
