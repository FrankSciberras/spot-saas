import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import FinancialsDashboard, { type LedgerLine } from '@/components/admin/FinancialsDashboard';
import { resolveFinanceCategories } from '@/lib/config/financeCategories';
import { postDueRecurringCosts } from '@/lib/bookkeeping/recurring';

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

  // Repeating bills due since the last visit — so the numbers here match the
  // Bookkeeping page even if the daily cron hasn't run yet. Idempotent.
  await postDueRecurringCosts(createAdminClient(), orgId).catch(() => undefined);

  const [
    { data: transactions },
    { data: categoryRows },
    { data: drivers },
    { data: settlements },
  ] = await Promise.all([
    supabase
      .from('finance_transactions')
      .select('id, txn_date, category_id, amount, description, counterparty, source')
      .eq('organization_id', orgId)
      .order('txn_date', { ascending: true }),
    supabase
      .from('org_finance_categories')
      .select('id, key, name, kind, icon, color, sort_order, is_active, is_system')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('drivers')
      .select('id, full_name, status')
      .eq('organization_id', orgId)
      .order('full_name'),
    supabase
      .from('driver_settlements')
      .select(`
        *,
        drivers:driver_id (id, full_name, status),
        settlement_platforms (*)
      `)
      .eq('organization_id', orgId)
      .order('week_start', { ascending: true }),
  ]);

  return (
    <FinancialsDashboard
      transactions={(transactions || []) as LedgerLine[]}
      categories={resolveFinanceCategories(categoryRows)}
      drivers={drivers || []}
      settlements={settlements || []}
    />
  );
}
