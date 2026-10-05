import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { derivePeriodBounds, parseDate, toISODate } from '@/lib/utils/bookkeepingPeriods';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import InviteBanner from '@/components/shared/InviteBanner';
import FleetDashboard, {
  type ExpiringDoc,
  type RecentShift,
} from '@/components/fleet/FleetDashboard';
import FleetDashboardSkeleton from '@/components/fleet/FleetDashboardSkeleton';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/**
 * Fleet Dashboard — overview of drivers, vehicles, shifts, finances and
 * expiring documents, rendered in the standalone Rovora Fleet design.
 *
 * The shell (sidebar + topbar) renders immediately; the data-heavy dashboard
 * body streams in behind a Suspense boundary, showing a skeleton meanwhile.
 */
export default async function FleetDashboardPage() {
  const user = await requireRole(['admin', 'staff']);
  const isAdmin = user.role === 'admin';

  return (
    <FleetShell user={user} title="Dashboard">
      <Suspense fallback={null}>
        <InviteBanner userId={user.id} />
      </Suspense>
      <Suspense fallback={<FleetDashboardSkeleton isAdmin={isAdmin} />}>
        <DashboardContent user={user} isAdmin={isAdmin} />
      </Suspense>
    </FleetShell>
  );
}

/** Server component that performs every dashboard query, then renders. */
async function DashboardContent({ user, isAdmin }: { user: FleetUser; isAdmin: boolean }) {
  const supabase = await createClient();

  // Onboarding signals (admin only): whether pay is configured (any preset) and
  // whether a first settlement exists. `head + count` keeps these near-free.
  const onboardingProbe = isAdmin
    ? Promise.all([
        supabase.from('settlement_presets').select('id', { count: 'exact', head: true }).eq('organization_id', user.organization_id),
        supabase.from('driver_settlements').select('id', { count: 'exact', head: true }).eq('organization_id', user.organization_id),
      ])
    : Promise.resolve([{ count: 1 }, { count: 1 }] as { count: number | null }[]);

  const [driversResult, vehiclesResult, shiftsResult, [presetProbe, settlementProbe]] = await Promise.all([
    supabase.from('drivers').select('id, status').eq('organization_id', user.organization_id),
    supabase.from('vehicles').select('id, status').eq('organization_id', user.organization_id),
    supabase
      .from('driver_shifts')
      .select('id, start_time, driver_id, drivers(full_name), vehicles(registration_number)')
      .eq('organization_id', user.organization_id)
      .order('start_time', { ascending: false })
      .limit(6),
    onboardingProbe,
  ]);

  const drivers = driversResult.data || [];
  const vehicles = vehiclesResult.data || [];
  const activeDrivers = drivers.filter((d) => d.status === 'active').length;
  const totalDrivers = drivers.length;
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter((v) => v.status === 'active').length;
  const idleVehicles = vehicles.filter((v) => v.status === 'idle').length;
  const serviceVehicles = vehicles.filter((v) => v.status === 'service').length;

  const recentShifts: RecentShift[] = (shiftsResult.data || []).map((s: any) => {
    const start = s.start_time ? new Date(s.start_time) : null;
    return {
      id: String(s.id),
      name: s.drivers?.full_name || 'Unknown driver',
      vehicle: s.vehicles?.registration_number ?? null,
      clockIn: start ? start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
      date: start ? start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '',
    };
  });

  // Expiring / expired documents within 30 days
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiryDate = thirtyDaysFromNow.toISOString().split('T')[0];

  const [{ data: expiringDriverRows }, { data: expiringVehicleRows }] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, full_name, id_card_expiry_date, police_conduct_expiry_date, driving_license_expiry_date')
      .eq('organization_id', user.organization_id)
      .or(`id_card_expiry_date.lte.${expiryDate},police_conduct_expiry_date.lte.${expiryDate},driving_license_expiry_date.lte.${expiryDate}`)
      .limit(20),
    supabase
      .from('vehicles')
      .select('id, registration_number, make, model, insurance_expiry_date, road_license_expiry_date')
      .eq('organization_id', user.organization_id)
      .or(`insurance_expiry_date.lte.${expiryDate},road_license_expiry_date.lte.${expiryDate}`)
      .limit(20),
  ]);

  const daysUntil = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - now.getTime()) / 86_400_000);

  const expiringDocs: ExpiringDoc[] = [];
  for (const d of expiringDriverRows || []) {
    const items: [string, string | null][] = [
      ['ID Card', d.id_card_expiry_date],
      ['Police Conduct', d.police_conduct_expiry_date],
      ['Driving License', d.driving_license_expiry_date],
    ];
    for (const [doc, date] of items) {
      if (date && new Date(date) <= thirtyDaysFromNow) {
        expiringDocs.push({ kind: 'driver', subject: d.full_name, doc, expires: date, daysLeft: daysUntil(date), href: `/fleet/drivers/${d.id}/edit` });
      }
    }
  }
  for (const v of expiringVehicleRows || []) {
    const subject = v.make && v.model ? `${v.registration_number} · ${v.make} ${v.model}` : v.registration_number;
    const items: [string, string | null][] = [
      ['Insurance', v.insurance_expiry_date],
      ['Road License', v.road_license_expiry_date],
    ];
    for (const [doc, date] of items) {
      if (date && new Date(date) <= thirtyDaysFromNow) {
        expiringDocs.push({ kind: 'vehicle', subject, doc, expires: date, daysLeft: daysUntil(date), href: `/fleet/vehicles/${v.id}/edit` });
      }
    }
  }
  expiringDocs.sort((a, b) => a.daysLeft - b.daysLeft);
  const topExpiringDocs = expiringDocs.slice(0, 8);

  // Financials (admin only) — the last 12 weeks of the ledger, bucketed by
  // Mon–Sun week. Categories are per-fleet data, so the expense breakdown is
  // built from whatever the fleet actually keeps books in.
  type LedgerRow = { txn_date: string; category_id: string; amount: number };
  type CategoryRow = { id: string; name: string; kind: string; color: string };
  const DASHBOARD_WEEKS = 12;
  const thisWeek = derivePeriodBounds('week', toISODate(new Date()));
  const windowStart = toISODate(new Date(parseDate(thisWeek.start).getTime() - (DASHBOARD_WEEKS - 1) * 7 * 86_400_000));

  const [transactionsResult, financeCategoriesResult] = isAdmin
    ? await Promise.all([
        supabase
          .from('finance_transactions')
          .select('txn_date, category_id, amount')
          .eq('organization_id', user.organization_id)
          .gte('txn_date', windowStart)
          .lte('txn_date', thisWeek.end)
          .order('txn_date', { ascending: true }),
        supabase
          .from('org_finance_categories')
          .select('id, name, kind, color, sort_order')
          .eq('organization_id', user.organization_id),
      ])
    : [{ data: [] as LedgerRow[] }, { data: [] as CategoryRow[] }];

  const ledger = (transactionsResult.data || []) as LedgerRow[];
  const allCategories = (financeCategoriesResult.data || []) as CategoryRow[];
  const categoryKind = new Map(allCategories.map((c) => [c.id, c.kind]));
  const expenseCategories = allCategories.filter((c) => c.kind === 'expense');

  // One point per week in the window, including empty weeks, so the line is
  // continuous and "vs prev week" always compares real neighbours.
  const weekBuckets = new Map<string, { label: string; income: number; expenses: number; profit: number }>();
  for (let i = 0; i < DASHBOARD_WEEKS; i += 1) {
    const ws = toISODate(new Date(parseDate(windowStart).getTime() + i * 7 * 86_400_000));
    weekBuckets.set(ws, {
      label: parseDate(ws).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
      income: 0, expenses: 0, profit: 0,
    });
  }

  const totals = { income: 0, expenses: 0, profit: 0 };
  const expenseByCategory = new Map<string, number>();
  for (const t of ledger) {
    const amount = Number(t.amount) || 0;
    if (amount <= 0) continue;
    const bucket = weekBuckets.get(derivePeriodBounds('week', t.txn_date.split('T')[0]).start);
    const isIncome = categoryKind.get(t.category_id) === 'income';
    if (isIncome) {
      totals.income += amount;
      if (bucket) bucket.income += amount;
    } else {
      totals.expenses += amount;
      if (bucket) bucket.expenses += amount;
      expenseByCategory.set(t.category_id, (expenseByCategory.get(t.category_id) || 0) + amount);
    }
  }
  totals.profit = totals.income - totals.expenses;
  for (const b of weekBuckets.values()) b.profit = b.income - b.expenses;

  // Only plot once there is something in the window — an all-zero line is
  // noise, and the dashboard swaps in the onboarding cards instead.
  const financialSeries = ledger.length > 0 ? Array.from(weekBuckets.values()) : [];

  const expensePalette = ['#f06464', '#f5b54a', '#2bbd7e', '#a78bfa', '#22d3ee', '#3ecf8e', '#ec4899', '#94a3b8'];
  const expenseBreakdown = expenseCategories
    .map((c) => ({
      label: String(c.name),
      amount: expenseByCategory.get(c.id) || 0,
      color: c.color as string,
    }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((e, i) => ({ ...e, color: e.color || expensePalette[i % expensePalette.length] }));

  const userName = user.full_name?.split(' ')[0] || 'there';

  const onboarding = isAdmin
    ? {
        hasDrivers: totalDrivers > 0,
        hasVehicles: totalVehicles > 0,
        hasPay: (presetProbe.count ?? 0) > 0,
        hasSettlement: (settlementProbe.count ?? 0) > 0,
      }
    : undefined;

  return (
    <FleetDashboard
      userName={userName}
      isAdmin={isAdmin}
      stats={{
        activeDrivers,
        totalDrivers,
        activeVehicles,
        idleVehicles,
        serviceVehicles,
        totalVehicles,
        recentShiftsCount: recentShifts.length,
      }}
      financialSeries={financialSeries}
      totals={totals}
      expenseBreakdown={expenseBreakdown}
      expiringDocs={topExpiringDocs}
      recentShifts={recentShifts}
      onboarding={onboarding}
    />
  );
}
