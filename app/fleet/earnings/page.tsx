import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { resolveFinanceCategories } from '@/lib/config/financeCategories';
import type { BookkeepingPeriodWithEntries, VehicleRecurringCost } from '@/lib/types/database';
import EarningsWorkspace from './EarningsWorkspace';

const CATEGORY_COLUMNS = 'id, key, name, kind, icon, color, sort_order, is_active, is_system';

/**
 * Admin Bookkeeping Page
 */
export default async function EarningsPage() {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'bookkeeping');
  return (
    <FleetShell user={user} title="Bookkeeping">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <EarningsContent orgId={user.organization_id} />
      </Suspense>
    </FleetShell>
  );
}

async function EarningsContent({ orgId }: { orgId: string }) {
  const supabase = await createClient();

  // Categories first — everything else is rendered against them.
  let { data: categoryRows } = await supabase
    .from('org_finance_categories')
    .select(CATEGORY_COLUMNS)
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true });

  // Self-heal: fleets created before the seeding trigger existed have no
  // categories, which would render an empty page with no way to recover.
  if (!categoryRows || categoryRows.length === 0) {
    const admin = createAdminClient();
    await admin.rpc('seed_default_finance_categories', { p_org: orgId });
    const { data: seeded } = await supabase
      .from('org_finance_categories')
      .select(CATEGORY_COLUMNS)
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true });
    categoryRows = seeded;
  }

  const [
    { data: periods },
    { data: settlements },
    { data: vehicleCosts },
    { data: vehicles },
  ] = await Promise.all([
    supabase
      .from('bookkeeping_periods')
      .select('*, entries:bookkeeping_entries(*)')
      .eq('organization_id', orgId)
      .order('start_date', { ascending: false }),
    supabase
      .from('driver_settlements')
      .select('week_start, week_end, week_label, period_name')
      .eq('organization_id', orgId)
      .order('week_start', { ascending: false }),
    supabase
      .from('vehicle_recurring_costs')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicles')
      .select('id, registration_number, make, model')
      .eq('organization_id', orgId)
      .order('registration_number', { ascending: true }),
  ]);

  // Unique settlement periods, newest first.
  const seen = new Set<string>();
  const settlementPeriods = (settlements || []).filter((s) => {
    const key = `${s.week_start}_${s.week_end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <EarningsWorkspace
      categories={resolveFinanceCategories(categoryRows)}
      periods={(periods || []) as BookkeepingPeriodWithEntries[]}
      settlementPeriods={settlementPeriods}
      vehicleCosts={(vehicleCosts || []) as VehicleRecurringCost[]}
      vehicles={vehicles || []}
    />
  );
}
