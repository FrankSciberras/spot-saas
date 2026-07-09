import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
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
        supabase.from('settlement_presets').select('id', { count: 'exact', head: true }),
        supabase.from('driver_settlements').select('id', { count: 'exact', head: true }),
      ])
    : Promise.resolve([{ count: 1 }, { count: 1 }] as { count: number | null }[]);

  const [driversResult, vehiclesResult, shiftsResult, [presetProbe, settlementProbe]] = await Promise.all([
    supabase.from('drivers').select('id, status'),
    supabase.from('vehicles').select('id, status'),
    supabase
      .from('driver_shifts')
      .select('id, start_time, driver_id, drivers(full_name), vehicles(registration_number)')
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
      .or(`id_card_expiry_date.lte.${expiryDate},police_conduct_expiry_date.lte.${expiryDate},driving_license_expiry_date.lte.${expiryDate}`)
      .limit(20),
    supabase
      .from('vehicles')
      .select('id, registration_number, make, model, insurance_expiry_date, road_license_expiry_date')
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

  // Financials (admin only)
  const bookkeepingEntriesResult = isAdmin
    ? await supabase
        .from('weekly_bookkeeping')
        .select('week_start, week_label, total_income, total_expenses, net_profit, employees, repairs, insurance, investments, vat, rent, employee_tax, other_expenses')
        .order('week_start', { ascending: true })
    : { data: [] as any[] };
  const bookkeepingEntries = bookkeepingEntriesResult.data || [];

  const financialSeries = bookkeepingEntries.map((b: any) => ({
    label: String(b.week_label || ''),
    income: Number(b.total_income) || 0,
    expenses: Number(b.total_expenses) || 0,
    profit: Number(b.net_profit) || 0,
  }));

  const totals = bookkeepingEntries.reduce(
    (acc, b: any) => {
      acc.income += Number(b.total_income) || 0;
      acc.expenses += Number(b.total_expenses) || 0;
      acc.profit += Number(b.net_profit) || 0;
      return acc;
    },
    { income: 0, expenses: 0, profit: 0 }
  );

  const expenseTotals = bookkeepingEntries.reduce(
    (acc, b: any) => {
      acc.employees += Number(b.employees) || 0;
      acc.repairs += Number(b.repairs) || 0;
      acc.insurance += Number(b.insurance) || 0;
      acc.investments += Number(b.investments) || 0;
      acc.vat += Number(b.vat) || 0;
      acc.rent += Number(b.rent) || 0;
      acc.employee_tax += Number(b.employee_tax) || 0;
      acc.other += Number(b.other_expenses) || 0;
      return acc;
    },
    { employees: 0, repairs: 0, insurance: 0, investments: 0, vat: 0, rent: 0, employee_tax: 0, other: 0 }
  );

  const expensePalette = ['#f06464', '#f5b54a', '#2bbd7e', '#a78bfa', '#22d3ee', '#3ecf8e', '#ec4899', '#94a3b8'];
  const expenseBreakdown = [
    { label: 'Employees', amount: expenseTotals.employees },
    { label: 'Repairs', amount: expenseTotals.repairs },
    { label: 'Insurance', amount: expenseTotals.insurance },
    { label: 'Investments', amount: expenseTotals.investments },
    { label: 'VAT', amount: expenseTotals.vat },
    { label: 'Rent', amount: expenseTotals.rent },
    { label: 'Employee tax', amount: expenseTotals.employee_tax },
    { label: 'Other', amount: expenseTotals.other },
  ]
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((e, i) => ({ ...e, color: expensePalette[i % expensePalette.length] }));

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
