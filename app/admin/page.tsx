import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { getAllPlans } from '@/lib/billing/plans-data';
import { stripeCustomerUrl } from '@/lib/billing/stripe-dashboard';
import AdminConsole from './console/AdminConsole';
import {
  type AdminData,
  type Operator,
  type OpStatus,
  type RealPlan,
  type PlanMeta,
  type PlanMixEntry,
  type TrendPoint,
  type ActivityItem,
  type BillingRow,
  type PackageDef,
  type Inquiry,
  type InquiryStatus,
} from './console/types';

export const dynamic = 'force-dynamic';

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f0a35e', '#7c9cff', '#f06464'];

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
  subscription_status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
}

function mapStatus(rawStatus: string, plan: RealPlan, trialExpired: boolean): OpStatus {
  if (rawStatus === 'cancelled') return 'churned';
  if (rawStatus === 'suspended') return 'past_due';
  if (plan === 'trial') return trialExpired ? 'past_due' : 'trial';
  return 'active';
}

/** Soft background token/colour for a plan's pill, derived from its accent. */
function softBg(color: string | null): string {
  if (!color) return 'var(--bg-3)';
  if (color.startsWith('#')) return color + '22';
  if (color.includes('accent')) return 'var(--accent-soft)';
  return 'var(--bg-3)';
}

export default async function PlatformOverviewPage() {
  const adminUser = await requirePlatformAdmin();
  const admin = createAdminClient();

  const [planRows, { data: orgs }, { data: members }, { data: drivers }, { data: vehicles }, { data: users }, { data: inquiryRows }] =
    await Promise.all([
      getAllPlans(),
      admin
        .from('organizations')
        .select('id, name, slug, status, plan, trial_ends_at, plan_activated_at, created_at, subscription_status, current_period_end, stripe_customer_id')
        .order('created_at', { ascending: true }),
      admin.from('memberships').select('organization_id, user_id, role'),
      admin.from('drivers').select('organization_id'),
      admin.from('vehicles').select('organization_id'),
      admin.from('users').select('id, email'),
      // Contact-form submissions. If the table doesn't exist yet (migration not
      // applied), Supabase returns { data: null, error } — so `inquiryRows` is
      // null and the inbox is simply empty; the page never fails.
      admin
        .from('contact_inquiries')
        .select('id, name, email, phone, company, fleet_size, topic, message, status, source, created_at, handled_at')
        .order('created_at', { ascending: false }),
    ]);

  // Catalogue-derived lookups (replace the old hardcoded PLAN_PRICE / PLAN_META).
  const priceByKey: Record<string, number> = {};
  const planMeta: Record<string, PlanMeta> = {
    trial: { label: 'Trial', color: 'var(--text-3)', bg: 'var(--bg-3)' },
  };
  for (const p of planRows) {
    priceByKey[p.key] = Number(p.price_amount) || 0;
    planMeta[p.key] = { label: p.name, color: p.color || 'var(--text-2)', bg: softBg(p.color) };
  }
  const priceOf = (plan: string) => priceByKey[plan] ?? 0;
  const labelOf = (plan: string) => planMeta[plan]?.label ?? plan;
  const paidKeys = planRows.map((p) => p.key);
  const assignablePlans = ['trial', ...paidKeys];

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
      mrr: paying ? priceOf(plan) : 0,
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
    pastDueMrr: operators.filter((o) => o.status === 'past_due').reduce((s, o) => s + priceOf(o.plan), 0),
    lostMrr: operators.filter((o) => o.status === 'churned').reduce((s, o) => s + priceOf(o.plan), 0),
  };

  // Plan mix across paying accounts — one row per package in the catalogue.
  const planMix: PlanMixEntry[] = paidKeys.map((id) => {
    const accts = paying.filter((o) => o.plan === id);
    return {
      id,
      name: labelOf(id),
      color: planMeta[id]?.color ?? 'var(--text-2)',
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
      if (activated < end) v += priceOf(plan);
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
        meta: `−${priceOf(o.plan) ? '€' + priceOf(o.plan) : '€0'} MRR · ${labelOf(o.plan)}`,
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
        what: `subscribed to ${labelOf(o.plan)}`,
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

  // Real per-operator billing status, derived from the organizations table. Actual
  // invoices live in Stripe and are reached per operator via `stripeUrl` — we do
  // NOT fabricate invoice rows here.
  const orgById = new Map(orgRows.map((o) => [o.id, o]));
  const billing: BillingRow[] = paying.map((o) => {
    const raw = orgById.get(o.id);
    const rawSub = raw?.subscription_status ?? null;
    const status: BillingRow['status'] =
      o.status === 'past_due' || rawSub === 'past_due' || rawSub === 'unpaid'
        ? 'past_due'
        : rawSub === 'canceled'
          ? 'canceled'
          : rawSub === 'trialing'
            ? 'trialing'
            : 'active';
    return {
      id: o.id,
      operator: o.name,
      initials: o.initials,
      color: o.color,
      plan: o.plan,
      amount: o.mrr,
      status,
      subscriptionStatus: rawSub,
      renewsAt: raw?.current_period_end ?? o.renews,
      stripeUrl: stripeCustomerUrl(raw?.stripe_customer_id ?? null),
    };
  });

  interface InquiryRow {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    fleet_size: string | null;
    topic: string;
    message: string;
    status: string;
    source: string;
    created_at: string;
    handled_at: string | null;
  }
  const inquiries: Inquiry[] = ((inquiryRows as InquiryRow[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    company: r.company,
    fleetSize: r.fleet_size,
    topic: r.topic,
    message: r.message,
    status: (r.status as InquiryStatus) ?? 'new',
    source: r.source,
    createdAt: r.created_at,
    handledAt: r.handled_at,
  }));

  const packages: PackageDef[] = planRows.map((p) => ({
    id: p.key,
    name: p.name,
    rate: Number(p.price_amount) || 0,
    blurb: p.blurb ?? '',
    cap: p.cap_label ?? '',
    features: p.features ?? [],
    color: p.color ?? 'var(--text-2)',
    popular: p.is_popular,
  }));

  const data: AdminData = {
    operators,
    metrics,
    planMix,
    trend,
    activity,
    packages,
    billing,
    inquiries,
    totals: {
      operators: operators.length,
      users: (users as unknown[])?.length ?? 0,
      drivers: (drivers as unknown[])?.length ?? 0,
      vehicles: (vehicles as unknown[])?.length ?? 0,
    },
    momGrowth,
    adminEmail: adminUser.email,
    planMeta,
    assignablePlans,
  };

  return <AdminConsole data={data} />;
}
