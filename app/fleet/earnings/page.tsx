import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import EarningsWorkspace from './EarningsWorkspace';

/**
 * Admin Weekly Bookkeeping Page
 */
export default async function EarningsPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Fetch all weekly bookkeeping entries
  const { data: entries } = await supabase
    .from('weekly_bookkeeping')
    .select('*')
    .order('week_start', { ascending: false });

  // Fetch settlement periods (unique week_start/week_end combinations)
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select('week_start, week_end, week_label, period_name')
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

  return (
    <FleetShell user={user} title="Weekly Bookkeeping">
      <EarningsWorkspace entries={entries || []} settlementPeriods={settlementPeriods} />
    </FleetShell>
  );
}
