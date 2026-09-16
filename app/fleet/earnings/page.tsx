import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { resolveFinanceCategories } from '@/lib/config/financeCategories';
import { postDueRecurringCosts } from '@/lib/bookkeeping/recurring';
import type { FinanceTransaction, VehicleRecurringCost } from '@/lib/types/database';
import LedgerWorkspace from './LedgerWorkspace';

const CATEGORY_COLUMNS = 'id, key, name, kind, icon, color, sort_order, is_active, is_system';

/** Newest lines first; small fleets never approach this, and the page groups by day. */
const MAX_TRANSACTIONS = 5000;

/**
 * Admin Bookkeeping Page — the transaction ledger.
 */
export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'bookkeeping');
  const { add } = await searchParams;
  const initialAdd = add === 'expense' || add === 'income' ? add : null;

  return (
    <FleetShell user={user} title="Bookkeeping">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={4} />}>
        <LedgerContent orgId={user.organization_id} initialAdd={initialAdd} />
      </Suspense>
    </FleetShell>
  );
}

async function LedgerContent({ orgId, initialAdd }: { orgId: string; initialAdd: 'expense' | 'income' | null }) {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Categories first — everything else is rendered against them.
  let { data: categoryRows } = await supabase
    .from('org_finance_categories')
    .select(CATEGORY_COLUMNS)
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true });

  // Self-heal: fleets created before the seeding trigger existed have no
  // categories, which would render an empty page with no way to recover.
  if (!categoryRows || categoryRows.length === 0) {
    await admin.rpc('seed_default_finance_categories', { p_org: orgId });
    const { data: seeded } = await supabase
      .from('org_finance_categories')
      .select(CATEGORY_COLUMNS)
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true });
    categoryRows = seeded;
  }

  // Repeating bills: post anything that fell due since the last visit, so the
  // ledger is current even if the daily cron hasn't run yet. Idempotent.
  await postDueRecurringCosts(admin, orgId).catch(() => undefined);

  const [
    { data: transactions, error: txnError },
    { data: vehicleCosts },
    { data: vehicles },
    { data: drivers },
  ] = await Promise.all([
    supabase
      .from('finance_transactions')
      .select('*')
      .eq('organization_id', orgId)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(MAX_TRANSACTIONS),
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
    supabase
      .from('drivers')
      .select('id, full_name, status')
      .eq('organization_id', orgId)
      .order('full_name', { ascending: true }),
  ]);

  // The ledger table is added by 20260916_finance_transactions.sql. Until that
  // migration has run, say so plainly instead of rendering an empty ledger
  // that quietly swallows every save.
  if (txnError && /finance_transactions/.test(txnError.message)) {
    return (
      <div style={{ padding: 24, background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.6 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-1)', marginBottom: 6 }}>Bookkeeping needs a database update</div>
        The transaction ledger table is not installed yet. Run
        <code style={{ margin: '0 4px', padding: '1px 6px', background: 'var(--bg-2)', borderRadius: 4 }}>supabase/migrations/20260916_finance_transactions.sql</code>
        in the Supabase SQL editor, then refresh this page.
      </div>
    );
  }

  return (
    <LedgerWorkspace
      categories={resolveFinanceCategories(categoryRows)}
      transactions={(transactions || []) as FinanceTransaction[]}
      vehicleCosts={(vehicleCosts || []) as VehicleRecurringCost[]}
      vehicles={vehicles || []}
      drivers={drivers || []}
      initialAdd={initialAdd}
    />
  );
}
