import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlatformAdmin } from '@/lib/auth/platform';
import { getAllPlans } from '@/lib/billing/plans-data';
import { isStripeEnabled } from '@/lib/billing/stripe';
import { importStripeHistory } from '@/lib/billing/billing-events';
import { chunk, createdIn, fetchAll, listAuthUsers, selfServeSignups } from '@/lib/analytics/admin-data';
import type { BusinessData, BusinessPeriod, CohortUnit, TrialRow } from '@/lib/analytics/business-types';

// =============================================================================
// /api/admin/analytics/business — customer insights for Admin Console → Analytics
// =============================================================================
//   GET  ?from&to&prevFrom&tz   accounts, trials, subscriptions, revenue and
//                               retention for a date range, against the period
//                               before it (same length, starting at prevFrom)
//   POST {"action":"import"}    fill the billing history from Stripe
//
// Where each number comes from:
//   accounts / registrations   Supabase Auth (self-serve sign-ups only)
//   trials / activation        organizations + their vehicles and drivers
//   MRR / plans / paying now   organizations × plans — the same rule as the
//                              console's Overview, so the two always agree
//   renewals, plan changes,    billing_events (Stripe webhook + import) — see
//   cancellations, failures    lib/billing/billing-events.ts
//
// Platform admin only. Not narrowed by the page's website filters: these are
// facts about accounts, not visits (except `attribution`).
// =============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface OrgRow {
  id: string;
  name: string;
  status: string;
  plan: string | null;
  created_at: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  plan_activated_at: string | null;
  subscription_status: string | null;
}

interface BillingRow {
  organization_id: string | null;
  occurred_at: string;
  kind: string;
  plan_from: string | null;
  plan_to: string | null;
  amount: number | string | null;
  currency: string | null;
  reason: string | null;
  comment: string | null;
  device: string | null;
  attempts: number | null;
  recovered: boolean;
}

const DAY = 86_400_000;
const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v) || 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Local calendar parts of an instant in the admin's time zone. */
function localYmd(t: number, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Start of the day / week (Monday) / month an instant falls in, as YYYY-MM-DD. */
function cohortKey(t: number, unit: CohortUnit, tz: string): string {
  const { y, m, d } = localYmd(t, tz);
  if (unit === 'month') return `${y}-${pad(m)}-01`;
  if (unit === 'day') return `${y}-${pad(m)}-${pad(d)}`;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!(await getPlatformAdmin())) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const from = new Date(sp.get('from') ?? '');
  const to = new Date(sp.get('to') ?? '');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  if (to.getTime() - from.getTime() > 800 * DAY) {
    return NextResponse.json({ error: 'Range too long' }, { status: 400 });
  }
  const prevFromRaw = sp.get('prevFrom');
  const prevFrom = prevFromRaw ? new Date(prevFromRaw) : new Date(from.getTime() - (to.getTime() - from.getTime()));
  if (Number.isNaN(prevFrom.getTime()) || prevFrom >= from) {
    return NextResponse.json({ error: 'Invalid comparison period' }, { status: 400 });
  }
  const prevTo = new Date(prevFrom.getTime() + (to.getTime() - from.getTime()));
  const tzRaw = (sp.get('tz') ?? 'UTC').slice(0, 64);
  let tz = 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tzRaw });
    tz = tzRaw;
  } catch {
    /* unknown zone — stay on UTC */
  }

  try {
    const data = await build(from, to, prevFrom, prevTo, tz);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('analytics business failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await getPlatformAdmin())) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }
  let action = '';
  try {
    action = String((await request.json())?.action ?? '');
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (action !== 'import') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  if (!isStripeEnabled()) return NextResponse.json({ error: 'Stripe isn’t connected (STRIPE_SECRET_KEY is not set).' }, { status: 400 });
  try {
    const result = await importStripeHistory();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('stripe history import failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}

async function build(from: Date, to: Date, prevFrom: Date, prevTo: Date, tz: string): Promise<BusinessData> {
  const admin = createAdminClient();
  const now = Date.now();
  const inP = (t: number, a: Date, b: Date) => t >= a.getTime() && t < b.getTime();

  // ── Load everything (all small tables at this scale) ──
  const [plans, orgs, vehicles, drivers, users, billing, firstBilling, signupEvents] = await Promise.all([
    getAllPlans(),
    fetchAll<OrgRow>((a, b) =>
      admin
        .from('organizations')
        .select('id, name, status, plan, created_at, trial_started_at, trial_ends_at, plan_activated_at, subscription_status')
        .order('created_at', { ascending: true })
        .range(a, b),
    ),
    fetchAll<{ organization_id: string }>((a, b) => admin.from('vehicles').select('organization_id').range(a, b)),
    fetchAll<{ organization_id: string }>((a, b) => admin.from('drivers').select('organization_id').range(a, b)),
    listAuthUsers(admin),
    // Everything since the comparison period began — later events are needed
    // to work "paying at the start of the period" back from today.
    admin
      .from('billing_events')
      .select('organization_id, occurred_at, kind, plan_from, plan_to, amount, currency, reason, comment, device, attempts, recovered')
      .gte('occurred_at', prevFrom.toISOString())
      .order('occurred_at', { ascending: false })
      .limit(5000),
    admin.from('billing_events').select('occurred_at').order('occurred_at', { ascending: true }).limit(1),
    // Sign-ups recorded by the website analytics, to credit paying fleets to a source.
    admin
      .from('analytics_events')
      .select('props, session:analytics_sessions(channel, source, utm_campaign)')
      .eq('name', 'Signup')
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const billingReady = !billing.error;
  const events = ((billing.data ?? []) as BillingRow[]).map((e) => ({ ...e, t: Date.parse(e.occurred_at), amt: num(e.amount) }));
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const orgName = (id: string | null) => (id ? orgById.get(id)?.name ?? 'Deleted fleet' : 'Unknown fleet');

  const priceOf = new Map<string, number>(plans.map((p) => [p.key, Number(p.price_amount) || 0]));
  const planNames: Record<string, string> = { trial: 'Free trial', ...Object.fromEntries(plans.map((p) => [p.key, p.name])) };
  const vCount = new Map<string, number>();
  for (const v of vehicles) vCount.set(v.organization_id, (vCount.get(v.organization_id) ?? 0) + 1);
  const dCount = new Map<string, number>();
  for (const d of drivers) dCount.set(d.organization_id, (dCount.get(d.organization_id) ?? 0) + 1);

  // ── Paying now (same rule as the console's Overview) ──
  const planOf = (o: OrgRow) => o.plan ?? 'trial';
  const trialEnded = (o: OrgRow) => !!o.trial_ends_at && Date.parse(o.trial_ends_at) <= now;
  const isPaying = (o: OrgRow) => planOf(o) !== 'trial' && o.status !== 'cancelled';
  const paying = orgs.filter(isPaying);
  const mrr = paying.reduce((s, o) => s + (priceOf.get(planOf(o)) ?? 0), 0);

  // ── New subscriptions: recorded events, plus (for fleets with no recorded
  //    subscription at all — before the history began) when the plan was set ──
  const everSubscribed = new Set(events.filter((e) => e.kind === 'subscribed' && e.organization_id).map((e) => e.organization_id!));
  if (billingReady) {
    // Fleets whose subscription began before prevFrom still have an older event.
    const { data: older } = await admin.from('billing_events').select('organization_id').eq('kind', 'subscribed').lt('occurred_at', prevFrom.toISOString()).limit(5000);
    for (const r of (older ?? []) as { organization_id: string | null }[]) if (r.organization_id) everSubscribed.add(r.organization_id);
  }
  const subs: { orgId: string | null; t: number; plan: string | null; amount: number | null }[] = [
    ...events.filter((e) => e.kind === 'subscribed').map((e) => ({ orgId: e.organization_id, t: e.t, plan: e.plan_to, amount: e.amt || null })),
    ...orgs
      .filter((o) => planOf(o) !== 'trial' && o.plan_activated_at && !everSubscribed.has(o.id))
      .map((o) => ({ orgId: o.id, t: Date.parse(o.plan_activated_at!), plan: planOf(o), amount: priceOf.get(planOf(o)) ?? null })),
  ];
  const cancels = events.filter((e) => e.kind === 'cancelled');
  const payingAt = (t: number) =>
    Math.max(0, paying.length - subs.filter((s) => s.t >= t).length + cancels.filter((c) => c.t >= t).length);

  // ── Accounts (self-serve sign-ups) ──
  const { signups } = await selfServeSignups(admin, createdIn(users, prevFrom, to));

  // ── One period's numbers ──
  const period = (a: Date, b: Date): BusinessPeriod => {
    const ev = (kind: string) => events.filter((e) => e.kind === kind && inP(e.t, a, b));
    const acc = signups.filter((u) => inP(Date.parse(u.created_at), a, b));
    const newSubs = subs.filter((s) => inP(s.t, a, b));
    const ups = ev('upgraded');
    const downs = ev('downgraded');
    const cancelled = ev('cancelled');
    const failed = ev('payment_failed');
    const renewals = ev('renewed');
    const start = payingAt(a.getTime());
    return {
      accounts: acc.length,
      registrations: acc.filter((u) => !!u.email_confirmed_at).length,
      trials: orgs.filter((o) => inP(Date.parse(o.trial_started_at ?? o.created_at), a, b)).length,
      paid: newSubs.length,
      newMrr: round2(newSubs.reduce((s, x) => s + (x.amount ?? 0), 0)),
      renewals: renewals.length,
      renewalRevenue: round2(renewals.reduce((s, e) => s + e.amt, 0)),
      upgrades: ups.length,
      downgrades: downs.length,
      expansionMrr: round2(ups.reduce((s, e) => s + e.amt, 0)),
      contractionMrr: round2(-downs.reduce((s, e) => s + e.amt, 0)),
      cancellations: cancelled.length,
      cancelRequests: ev('cancel_scheduled').length,
      lostMrr: round2(cancelled.reduce((s, e) => s + e.amt, 0)),
      payingAtStart: start,
      churnRate: start > 0 ? cancelled.length / start : null,
      failedPayments: failed.length,
      failedAmount: round2(failed.reduce((s, e) => s + e.amt, 0)),
      recovered: failed.filter((e) => e.recovered).length,
      checkoutFailed: ev('checkout_failed').length,
      checkoutAbandoned: ev('checkout_abandoned').length,
    };
  };

  // ── Trials ──
  const used = (id: string) => (vCount.get(id) ?? 0) > 0 || (dCount.get(id) ?? 0) > 0;
  const activatedOrg = (id: string) => (vCount.get(id) ?? 0) > 0 && (dCount.get(id) ?? 0) > 0;
  const converted = (o: OrgRow) => planOf(o) !== 'trial' || everSubscribed.has(o.id);
  const trialStatus = (o: OrgRow): TrialRow['status'] =>
    converted(o) ? 'paid' : o.status === 'cancelled' ? 'cancelled' : trialEnded(o) ? 'expired' : 'running';

  const liveTrials = orgs.filter((o) => planOf(o) === 'trial' && o.status !== 'cancelled' && !trialEnded(o));
  const span = to.getTime() - from.getTime();
  const cohortUnit: CohortUnit = span <= 15 * DAY ? 'day' : span <= 120 * DAY ? 'week' : 'month';
  const started = orgs.filter((o) => inP(Date.parse(o.trial_started_at ?? o.created_at), from, to));
  const cohortMap = new Map<string, BusinessData['trials']['cohorts'][number]>();
  for (const o of started) {
    const k = cohortKey(Date.parse(o.trial_started_at ?? o.created_at), cohortUnit, tz);
    const c = cohortMap.get(k) ?? { start: k, started: 0, paid: 0, expired: 0, running: 0, unused: 0, activated: 0 };
    const st = trialStatus(o);
    c.started += 1;
    if (st === 'paid') c.paid += 1;
    else if (st === 'running') c.running += 1;
    else c.expired += 1;
    if (!used(o.id)) c.unused += 1;
    if (activatedOrg(o.id)) c.activated += 1;
    cohortMap.set(k, c);
  }

  // Owners of the trial fleets in the list, so they can be followed up.
  const listOrgs = [...started].sort((a, b) => {
    const ea = a.trial_ends_at ? Date.parse(a.trial_ends_at) : Infinity;
    const eb = b.trial_ends_at ? Date.parse(b.trial_ends_at) : Infinity;
    return ea - eb;
  }).slice(0, 300);
  const ownerEmail = new Map<string, string>();
  for (const part of chunk(listOrgs.map((o) => o.id), 100)) {
    const { data: ms } = await admin.from('memberships').select('organization_id, user_id').in('organization_id', part).eq('role', 'admin');
    const ids = [...new Set(((ms ?? []) as { organization_id: string; user_id: string }[]).map((m) => m.user_id))];
    const emails = new Map<string, string>();
    for (const idPart of chunk(ids, 150)) {
      const { data: us } = await admin.from('users').select('id, email').in('id', idPart);
      for (const u of (us ?? []) as { id: string; email: string | null }[]) if (u.email) emails.set(u.id, u.email);
    }
    for (const m of (ms ?? []) as { organization_id: string; user_id: string }[]) {
      if (!ownerEmail.has(m.organization_id) && emails.has(m.user_id)) ownerEmail.set(m.organization_id, emails.get(m.user_id)!);
    }
  }

  // ── Revenue by plan ──
  const newInPeriod = subs.filter((s) => inP(s.t, from, to));
  const planBreakdown = plans.map((p) => {
    const accts = paying.filter((o) => planOf(o) === p.key);
    return {
      key: p.key,
      name: p.name,
      color: p.color ?? null,
      accounts: accts.length,
      mrr: accts.length * (Number(p.price_amount) || 0),
      newInPeriod: newInPeriod.filter((s) => s.plan === p.key).length,
    };
  });

  // ── Retention ──
  const inCur = (e: { t: number }) => inP(e.t, from, to);
  const leaving = events.filter((e) => (e.kind === 'cancelled' || e.kind === 'cancel_scheduled') && inCur(e));
  const reasonCount = new Map<string, number>();
  for (const e of leaving) reasonCount.set(e.reason ?? 'none', (reasonCount.get(e.reason ?? 'none') ?? 0) + 1);
  const cancelledWithDate = new Set(events.filter((e) => e.kind === 'cancelled' && e.organization_id).map((e) => e.organization_id!));
  const failedCur = events.filter((e) => e.kind === 'payment_failed' && inCur(e));
  const failReasons = new Map<string, number>();
  for (const e of failedCur) failReasons.set(e.reason ?? 'unknown', (failReasons.get(e.reason ?? 'unknown') ?? 0) + 1);

  // ── Checkout problems by device ──
  const byDevice = new Map<string, { device: string; failed: number; abandoned: number }>();
  for (const e of events.filter((x) => (x.kind === 'checkout_failed' || x.kind === 'checkout_abandoned') && inCur(x))) {
    const d = e.device ?? 'Unknown';
    const row = byDevice.get(d) ?? { device: d, failed: 0, abandoned: 0 };
    if (e.kind === 'checkout_failed') row.failed += 1;
    else row.abandoned += 1;
    byDevice.set(d, row);
  }

  // ── Which source each new paying fleet signed up from ──
  type SignupRow = { props: { org_id?: string } | null; session: { channel: string | null; source: string | null; utm_campaign: string | null } | { channel: string | null; source: string | null; utm_campaign: string | null }[] | null };
  const signupSource = new Map<string, { channel: string; source: string; campaign: string | null }>();
  for (const r of (signupEvents.data ?? []) as SignupRow[]) {
    const id = r.props?.org_id;
    if (!id || signupSource.has(id)) continue;
    const s = Array.isArray(r.session) ? r.session[0] : r.session;
    signupSource.set(id, s
      ? { channel: s.channel ?? 'Direct', source: s.source ?? 'Direct', campaign: s.utm_campaign ?? null }
      : { channel: 'Not tracked', source: 'Not tracked', campaign: null });
  }
  const attr = new Map<string, BusinessData['attribution'][number]>();
  for (const s of newInPeriod) {
    const src = (s.orgId && signupSource.get(s.orgId)) || { channel: 'Not tracked', source: 'Not tracked', campaign: null };
    const k = `${src.channel}|${src.source}|${src.campaign ?? ''}`;
    const row = attr.get(k) ?? { ...src, paying: 0 };
    row.paying += 1;
    attr.set(k, row);
  }

  // ── Funnel: fleets created in the period, followed to today ──
  const accCur = signups.filter((u) => inP(Date.parse(u.created_at), from, to));

  return {
    generatedAt: new Date().toISOString(),
    stripeEnabled: isStripeEnabled(),
    billingReady,
    billingSince: ((firstBilling.data ?? []) as { occurred_at: string }[])[0]?.occurred_at ?? null,
    current: period(from, to),
    previous: period(prevFrom, prevTo),
    funnel: {
      accounts: accCur.length,
      registrations: accCur.filter((u) => !!u.email_confirmed_at).length,
      trials: started.length,
      activated: started.filter((o) => activatedOrg(o.id)).length,
      paid: started.filter(converted).length,
    },
    trials: {
      active: liveTrials.length,
      expired: orgs.filter((o) => planOf(o) === 'trial' && !everSubscribed.has(o.id) && (trialEnded(o) || o.status === 'cancelled')).length,
      unused: liveTrials.filter((o) => !used(o.id)).length,
      expiringSoon: liveTrials.filter((o) => o.trial_ends_at && Date.parse(o.trial_ends_at) - now <= 7 * DAY).length,
      cohortUnit,
      cohorts: [...cohortMap.values()].sort((a, b) => a.start.localeCompare(b.start)),
      list: listOrgs.map((o) => ({
        id: o.id,
        name: o.name,
        startedAt: o.trial_started_at ?? o.created_at,
        endsAt: o.trial_ends_at,
        status: trialStatus(o),
        vehicles: vCount.get(o.id) ?? 0,
        drivers: dCount.get(o.id) ?? 0,
        ownerEmail: ownerEmail.get(o.id) ?? null,
      })),
    },
    revenue: {
      mrr,
      arr: mrr * 12,
      activePaid: paying.length,
      arpa: paying.length ? mrr / paying.length : 0,
      pastDue: paying.filter((o) => o.status === 'suspended' || o.subscription_status === 'past_due' || o.subscription_status === 'unpaid').length,
      plans: planBreakdown,
      newSubs: newInPeriod
        .sort((a, b) => b.t - a.t)
        .slice(0, 200)
        .map((s) => ({ at: new Date(s.t).toISOString(), orgId: s.orgId, org: orgName(s.orgId), plan: s.plan, amount: s.amount })),
      changes: events
        .filter((e) => (e.kind === 'upgraded' || e.kind === 'downgraded') && inCur(e))
        .slice(0, 200)
        .map((e) => ({ at: e.occurred_at, orgId: e.organization_id, org: orgName(e.organization_id), kind: e.kind as 'upgraded' | 'downgraded', planFrom: e.plan_from, planTo: e.plan_to, amount: e.amt || null })),
    },
    retention: {
      reasons: [...reasonCount.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      cancellations: leaving.slice(0, 200).map((e) => ({
        at: e.occurred_at,
        orgId: e.organization_id,
        org: orgName(e.organization_id),
        kind: e.kind as 'cancelled' | 'cancel_scheduled',
        plan: e.plan_from,
        reason: e.reason,
        comment: e.comment,
        amount: e.amt || null,
      })),
      failed: failedCur.slice(0, 200).map((e) => ({
        at: e.occurred_at,
        orgId: e.organization_id,
        org: orgName(e.organization_id),
        amount: e.amt || null,
        currency: e.currency,
        reason: e.reason,
        attempts: e.attempts,
        recovered: e.recovered,
      })),
      pastDueNow: paying
        .filter((o) => o.status === 'suspended' || o.subscription_status === 'past_due' || o.subscription_status === 'unpaid')
        .map((o) => ({ orgId: o.id, org: o.name, status: o.subscription_status ?? o.status })),
      unknownCancelled: orgs.filter((o) => o.status === 'cancelled' && planOf(o) !== 'trial' && !cancelledWithDate.has(o.id)).length,
    },
    friction: {
      checkout: [...byDevice.values()].sort((a, b) => b.failed + b.abandoned - (a.failed + a.abandoned)),
      failedByReason: [...failReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    },
    attribution: [...attr.values()].sort((a, b) => b.paying - a.paying),
    planNames,
  };
}
