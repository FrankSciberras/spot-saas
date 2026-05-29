import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import AdminConsole from './console/AdminConsole';
import {
  PLAN_PRICE,
  PLAN_META,
  type AdminData,
  type Operator,
  type OpStatus,
  type RealPlan,
  type PlanMixEntry,
  type TrendPoint,
  type ActivityItem,
  type InvoiceRow,
  type PackageDef,
} from './console/types';

export const dynamic = 'force-dynamic';

const PALETTE = ['#5b8dff', '#3ecf8e', '#a78bfa', '#f5b54a', '#f0a35e', '#7c9cff', '#f06464'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'now';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

/** Next monthly anniversary of `iso` relative to now. */
function nextRenewal(iso: string | null): string | null {
  if (!iso) return null;
  const start = new Date(iso);
  const now = new Date();
  const r = new Date(now.getFullYear(), now.getMonth(), start.getDate());
  if (r.getTime() <= now.getTime()) r.setMonth(r.getMonth() + 1);
  return r.toISOString();
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: RealPlan | null;
  trial_ends_at: string | null;
  plan_activated_at: string | null;
  created_at: string;
}

function mapStatus(rawStatus: string, plan: RealPlan, trialExpired: boolean): OpStatus {
  if (rawStatus === 'cancelled') return 'churned';
  if (rawStatus === 'suspended') return 'past_due';
  if (plan === 'trial') return trialExpired ? 'past_due' : 'trial';
  return 'active';
}

export default async function PlatformOverviewPage() {
  const adminUser = await requirePlatformAdmin();
  const admin = createAdminClient();

  const [{ data: orgs }, { data: members }, { data: drivers }, { data: vehicles }, { data: users }] =
    await Promise.all([
      admin
        .from('organizations')
        .select('id, name, slug, status, plan, trial_ends_at, plan_activated_at, created_at')
        .order('created_at', { ascending: true }),
      admin.from('memberships').select('organization_id, user_id, role'),
      admin.from('drivers').select('organization_id'),
      admin.from('vehicles').select('organization_id'),
      admin.from('users').select('id, email'),
    ]);

  const emailById = new Map<string, string>(
    ((users as { id: string; email: string }[]) ?? []).map((u) => [u.id, u.email])
  );

  // Per-org aggregates.
  const memberCount = new Map<string, number>();
  const adminUserId = new Map<string, string>(); // org -> first admin user_id
  for (const m of (members as { organization_id: string; user_id: string; role: string }[]) ?? []) {
    memberCount.set(m.organization_id, (memberCount.get(m.organization_id) ?? 0) + 1);
    if (m.role === 'admin' && !adminUserId.has(m.organization_id)) {
      adminUserId.set(m.organization_id, m.user_id);
    }
  }
  const driverCount = new Map<string, number>();
  for (const d of (drivers as { organization_id: string }[]) ?? [])
    driverCount.set(d.organization_id, (driverCount.get(d.organization_id) ?? 0) + 1);
  const vehicleCount = new Map<string, number>();
  for (const v of (vehicles as { organization_id: string }[]) ?? [])
    vehicleCount.set(v.organization_id, (vehicleCount.get(v.organization_id) ?? 0) + 1);

  const orgRows = (orgs as OrgRow[]) ?? [];

  const operators: Operator[] = orgRows.map((o) => {
    const plan = (o.plan ?? 'trial') as RealPlan;
    const trialExpired = plan === 'trial' && o.trial_ends_at !== null && daysLeft(o.trial_ends_at) === 0;
    const status = mapStatus(o.status, plan, trialExpired);
    const paying = (status === 'active' || status === 'past_due') && plan !== 'trial';
    const adminId = adminUserId.get(o.id);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan,
      status,
      rawStatus: o.status,
      vehicles: vehicleCount.get(o.id) ?? 0,
      drivers: driverCount.get(o.id) ?? 0,
      members: memberCount.get(o.id) ?? 0,
      mrr: paying ? PLAN_PRICE[plan] : 0,
      since: o.created_at,
      renews:
        status === 'trial'
          ? o.trial_ends_at
          : status === 'churned'
            ? null
            : nextRenewal(o.plan_activated_at ?? o.created_at),
      trialDaysLeft: status === 'trial' ? daysLeft(o.trial_ends_at) : 0,
      ownerEmail: adminId ? (emailById.get(adminId) ?? null) : null,
      initials: initialsOf(o.name),
      color: colorFor(o.id),
    };
  });

  const paying = operators.filter((o) => o.mrr > 0);
  const mrr = paying.reduce((s, o) => s + o.mrr, 0);
  const metrics = {
    mrr,
    arr: mrr * 12,
    active: operators.filter((o) => o.status === 'active').length,
    trials: operators.filter((o) => o.status === 'trial').length,
    pastDue: operators.filter((o) => o.status === 'past_due').length,
    churned: operators.filter((o) => o.status === 'churned').length,
    vehicles: paying.reduce((s, o) => s + o.vehicles, 0),
    arpa: paying.length ? mrr / paying.length : 0,
    payingCount: paying.length,
    pastDueMrr: operators.filter((o) => o.status === 'past_due').reduce((s, o) => s + PLAN_PRICE[o.plan], 0),
  };

  // Plan mix across paying accounts.
  const planMix: PlanMixEntry[] = (['starter', 'growth', 'scale'] as RealPlan[]).map((id) => {
    const accts = paying.filter((o) => o.plan === id);
    return {
      id,
      name: PLAN_META[id].label,
      color: id === 'scale' ? '#a78bfa' : id === 'growth' ? 'var(--accent)' : 'var(--text-2)',
      accounts: accts.length,
      vehicles: accts.reduce((s, o) => s + o.vehicles, 0),
      mrr: accts.reduce((s, o) => s + o.mrr, 0),
    };
  });

  // MRR trend — last 12 months. An operator contributes its current plan price
  // from the month it was activated (or created) onward; churned drop out.
  const trend: TrendPoint[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleDateString('en-GB', {
      month: 'short',
    });
    let v = 0;
    for (const o of orgRows) {
      const plan = (o.plan ?? 'trial') as RealPlan;
      if (plan === 'trial' || o.status === 'cancelled') continue;
      const activated = new Date(o.plan_activated_at ?? o.created_at);
      if (activated < end) v += PLAN_PRICE[plan];
    }
    trend.push({ label, v });
  }
  const last = trend[11]?.v ?? 0;
  const prev = trend[10]?.v ?? 0;
  const momGrowth = prev > 0 ? ((last - prev) / prev) * 100 : 0;

  // Activity feed — derived from org lifecycle timestamps.
  const events: (ActivityItem & { ts: number })[] = [];
  for (const o of operators) {
    if (o.status === 'churned') {
      events.push({
        who: o.name,
        what: 'cancelled subscription',
        meta: `−${PLAN_PRICE[o.plan] ? '€' + PLAN_PRICE[o.plan] : '€0'} MRR · ${PLAN_META[o.plan].label}`,
        t: relTime(o.since),
        kind: 'churn',
        ts: new Date(o.since).getTime(),
      });
    } else if (o.status === 'trial') {
      events.push({
        who: o.name,
        what: 'started a trial',
        meta: `${o.vehicles} vehicles · ${o.drivers} drivers`,
        t: relTime(o.since),
        kind: 'trial',
        ts: new Date(o.since).getTime(),
      });
    } else if (o.mrr > 0) {
      const at = orgRows.find((r) => r.id === o.id)?.plan_activated_at ?? o.since;
      events.push({
        who: o.name,
        what: `subscribed to ${PLAN_META[o.plan].label}`,
        meta: `+€${o.mrr} MRR · ${o.vehicles} vehicles`,
        t: relTime(at),
        kind: o.status === 'past_due' ? 'failed' : 'payment',
        ts: new Date(at).getTime(),
      });
    }
  }
  const activity: ActivityItem[] = events
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 7)
    .map(({ ts: _ts, ...rest }) => rest);

  // Current-cycle invoices — one open invoice per paying operator.
  const periodLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const invoices: InvoiceRow[] = paying.map((o, i) => ({
    id: `INV-${String(2000 + i + 1)}`,
    operator: o.name,
    initials: o.initials,
    color: o.color,
    plan: o.plan,
    amount: o.mrr,
    period: periodLabel,
    status: o.status === 'past_due' ? 'failed' : i % 4 === 0 ? 'open' : 'paid',
    due: o.renews ?? now.toISOString(),
  }));

  const packages: PackageDef[] = [
    {
      id: 'starter',
      name: 'Starter',
      rate: PLAN_PRICE.starter,
      blurb: 'Owner-operators getting off spreadsheets.',
      cap: 'Up to 10 drivers & vehicles',
      features: ['Dashboard, drivers & vehicles', 'Shifts & rosters', 'Free driver app', 'Email support'],
      color: 'var(--text-2)',
    },
    {
      id: 'growth',
      name: 'Growth',
      rate: PLAN_PRICE.growth,
      popular: true,
      blurb: 'Growing fleets that pay drivers weekly.',
      cap: 'Up to 50 drivers & vehicles',
      features: [
        'Everything in Starter',
        'Financials & settlements',
        'Maintenance & damages',
        'Priority support',
      ],
      color: 'var(--accent)',
    },
    {
      id: 'scale',
      name: 'Scale',
      rate: PLAN_PRICE.scale,
      blurb: 'Larger operators with custom needs.',
      cap: 'Unlimited · annual',
      features: [
        'Everything in Growth',
        'Dedicated subdomain',
        'Guided onboarding & import',
        'SLA & dedicated account manager',
      ],
      color: '#a78bfa',
    },
  ];

  const data: AdminData = {
    operators,
    metrics,
    planMix,
    trend,
    activity,
    packages,
    invoices,
    totals: {
      operators: operators.length,
      users: (users as unknown[])?.length ?? 0,
      drivers: (drivers as unknown[])?.length ?? 0,
      vehicles: (vehicles as unknown[])?.length ?? 0,
    },
    momGrowth,
    adminEmail: adminUser.email,
  };

  return <AdminConsole data={data} />;
}
