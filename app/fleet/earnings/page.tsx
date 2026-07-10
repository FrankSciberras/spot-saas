import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import EarningsWorkspace from './EarningsWorkspace';

/**
 * Admin Weekly Bookkeeping Page
 */
export default async function EarningsPage() {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'bookkeeping');
  return (
    <FleetShell user={user} title="Weekly Bookkeeping">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <EarningsContent orgId={user.organization_id} />
      </Suspense>
    </FleetShell>
  );
}

async function EarningsContent({ orgId }: { orgId: string }) {
  const supabase = await createClient();

  // Fetch all weekly bookkeeping entries
  const { data: entries } = await supabase
    .from('weekly_bookkeeping')
    .select('*')
    .eq('organization_id', orgId)
    .order('week_start', { ascending: false });

  // Fetch settlement periods (unique week_start/week_end combinations)
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select('week_start, week_end, week_label, period_name')
    .eq('organization_id', orgId)
    .order('week_start', { ascending: false });

  // Get unique settlement periods
  const settlementPeriods = settlements?.reduce((acc, s) => {
    const key = `${s.week_start}_${s.week_end}`;
    if (!acc.find(p => `${p.week_start}_${p.week_end}` === key)) {
      acc.push({
        week_start: s.week_start,
        week_end: s.week_end,
        week_label: s.week_label,
        period_name: s.period_name,
      });
    }
    return acc;
  }, [] as Array<{ week_start: string; week_end: string; week_label: string; period_name: string | null }>) || [];

  return <EarningsWorkspace entries={entries || []} settlementPeriods={settlementPeriods} />;
}
