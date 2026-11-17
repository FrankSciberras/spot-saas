import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlatformAdmin } from '@/lib/auth/platform';
import {
  ONBOARDING_AT_KEY,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_KEY,
  SIGNUP_ERROR_EVENT,
  SIGNUP_STEPS,
  SIGNUP_STEP_EVENT,
} from '@/lib/analytics/signup-funnel';

// =============================================================================
// GET /api/admin/analytics/signups?from&to — the sign-up funnel in detail.
// =============================================================================
// Two views of the same journey, for Admin Console → Analytics:
//
//   form      Anonymous website events: saw the form → started typing →
//             pressed "Create account" → emailed a code → verified. Unique
//             visitors per step, split by device, plus why attempts failed.
//
//   accounts  Ground truth from the accounts themselves (Supabase Auth +
//             memberships): created → verified → each onboarding screen →
//             fleet → first vehicle → first driver → paying. Not affected by
//             ad blockers, and it covers accounts from before step tracking.
//
//   unfinished  The people behind the gap: accounts created in the period
//             that never got a fleet, with how far they got — so they can be
//             followed up.
//
// Platform admin only. Everything is computed here rather than in SQL so this
// needs no migration.
// =============================================================================

export const dynamic = 'force-dynamic';

type Admin = SupabaseClient;

const PAGE = 1000;
const MAX_PAGES = 30;

/** Read every row of a query, 1000 at a time (PostgREST caps a single response). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

interface EventRow {
  name: string;
  props: Record<string, unknown> | null;
  visitor_id: string;
  session_id: string | null;
}

type Device = 'Desktop' | 'Mobile' | 'Tablet';
interface StepCount {
  visitors: number;
  count: number;
  desktop: number;
  mobile: number;
}

// ── The form, from anonymous website events ──────────────────────────────────

async function formFunnel(admin: Admin, from: Date, to: Date) {
  const names = [SIGNUP_STEP_EVENT, SIGNUP_ERROR_EVENT, 'Signup started', 'Signup'];
  const events = await fetchAll<EventRow>((a, b) =>
    admin
      .from('analytics_events')
      .select('name, props, visitor_id, session_id')
      .in('name', names)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(a, b),
  );

  // Which device each visit was on, to compare phones with desktops.
  const sessionIds = [...new Set(events.map((e) => e.session_id).filter((v): v is string => !!v))];
  const device = new Map<string, Device>();
  for (const ids of chunk(sessionIds, 150)) {
    const { data, error } = await admin.from('analytics_sessions').select('id, device').in('id', ids);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as { id: string; device: Device | null }[]) if (s.device) device.set(s.id, s.device);
  }

  // One bucket per (kind of event). A visitor counts once per bucket.
  const buckets = new Map<string, { all: Set<string>; desktop: Set<string>; mobile: Set<string>; count: number }>();
  const add = (key: string, e: EventRow) => {
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { all: new Set(), desktop: new Set(), mobile: new Set(), count: 0 }));
    b.count += 1;
    b.all.add(e.visitor_id);
    const d = e.session_id ? device.get(e.session_id) : undefined;
    if (d === 'Desktop') b.desktop.add(e.visitor_id);
    else if (d === 'Mobile' || d === 'Tablet') b.mobile.add(e.visitor_id);
  };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  for (const e of events) {
    const label = str(e.props?.label);
    const via = str(e.props?.via);
    if (e.name === 'Signup') add('fleet', e);
    else if (e.name === 'Signup started') {
      // The original "pressed Create account" event; its label is the door used.
      add('step:Submitted', e);
      if (label) add(`via:Submitted:${label}`, e);
    } else if (e.name === SIGNUP_STEP_EVENT && label) {
      add(`step:${label}`, e);
      if (via) add(`via:${label}:${via}`, e);
    } else if (e.name === SIGNUP_ERROR_EVENT && label) {
      add(`error:${label}`, e);
    }
  }

  const read = (key: string): StepCount => {
    const b = buckets.get(key);
    return { visitors: b?.all.size ?? 0, count: b?.count ?? 0, desktop: b?.desktop.size ?? 0, mobile: b?.mobile.size ?? 0 };
  };

  // When did the detailed steps start being recorded? Before that, a period
  // only has the older "started" and "fleet created" numbers.
  const { data: first } = await admin
    .from('analytics_events')
    .select('created_at')
    .eq('name', SIGNUP_STEP_EVENT)
    .order('created_at', { ascending: true })
    .limit(1);

  const doors = ['Email', 'Google', 'Chat'];
  return {
    tracking_since: (first?.[0] as { created_at: string } | undefined)?.created_at ?? null,
    steps: SIGNUP_STEPS.map((s) => ({ id: s.id, ...read(`step:${s.id}`) })),
    fleet: read('fleet'),
    code_resent: read('step:Code resent'),
    doors: doors.map((d) => ({
      name: d,
      submitted: read(`via:Submitted:${d}`).visitors,
      code_sent: read(`via:Code sent:${d}`).visitors,
      verified: read(`via:Email verified:${d}`).visitors,
    })),
    errors: [...buckets.entries()]
      .filter(([k]) => k.startsWith('error:'))
      .map(([k, b]) => ({ kind: k.slice(6), count: b.count, visitors: b.all.size }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── The accounts themselves ──────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown>;
}

async function accountFunnel(admin: Admin, from: Date, to: Date) {
  // Everyone who created an account in the period (Auth is the only place an
  // unverified or fleet-less account exists at all).
  const users: AuthUser[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    users.push(...(data.users as unknown as AuthUser[]));
    if (data.users.length < PAGE) break;
  }
  const inRange = users.filter((u) => {
    const t = Date.parse(u.created_at);
    return t >= from.getTime() && t < to.getTime();
  });

  const ids = inRange.map((u) => u.id);
  const memberships: { user_id: string; organization_id: string; role: string; created_at: string }[] = [];
  const invited = new Set<string>();
  for (const part of chunk(ids, 150)) {
    memberships.push(
      ...(await fetchAll<(typeof memberships)[number]>((a, b) =>
        admin.from('memberships').select('user_id, organization_id, role, created_at').in('user_id', part).range(a, b),
      )),
    );
    // Invited to someone else's fleet and not answered yet — not a sign-up of their own.
    const { data: inv } = await admin.from('membership_invites').select('user_id').in('user_id', part).eq('status', 'pending');
    for (const r of (inv ?? []) as { user_id: string }[]) invited.add(r.user_id);
    // Nor are the people who run the platform.
    const { data: staff } = await admin.from('platform_admins').select('user_id').in('user_id', part);
    for (const r of (staff ?? []) as { user_id: string }[]) invited.add(r.user_id);
  }
  const byUser = new Map<string, typeof memberships>();
  for (const m of memberships) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m]);

  // Self-serve sign-ups only: leave out people a fleet (or we) invited, and
  // drivers/staff who were added to an existing fleet.
  const signups = inRange.filter((u) => {
    if (u.invited_at || invited.has(u.id)) return false;
    const ms = byUser.get(u.id) ?? [];
    return ms.length === 0 || ms.some((m) => m.role === 'admin');
  });

  // How far each fleet got once it existed.
  const orgIds = [...new Set(signups.flatMap((u) => (byUser.get(u.id) ?? []).filter((m) => m.role === 'admin').map((m) => m.organization_id)))];
  const orgPlan = new Map<string, string | null>();
  const hasVehicle = new Set<string>();
  const hasDriver = new Set<string>();
  for (const part of chunk(orgIds, 100)) {
    const [orgs, vehicles, drivers] = await Promise.all([
      admin.from('organizations').select('id, plan').in('id', part),
      fetchAll<{ organization_id: string }>((a, b) => admin.from('vehicles').select('organization_id').in('organization_id', part).range(a, b)),
      fetchAll<{ organization_id: string }>((a, b) => admin.from('drivers').select('organization_id').in('organization_id', part).range(a, b)),
    ]);
    for (const o of (orgs.data ?? []) as { id: string; plan: string | null }[]) orgPlan.set(o.id, o.plan);
    for (const v of vehicles) hasVehicle.add(v.organization_id);
    for (const d of drivers) hasDriver.add(d.organization_id);
  }

  const stepOf = (u: AuthUser) => Number(u.app_metadata?.[ONBOARDING_STEP_KEY]) || 0;
  const provider = (u: AuthUser) => (u.app_metadata?.provider === 'google' ? 'google' : 'email');

  const counts = { created: 0, verified: 0, fleet: 0, vehicle: 0, driver: 0, paying: 0 };
  const onboarding = ONBOARDING_STEPS.map((s) => ({ step: s.step, title: s.title, reached: 0 }));
  const methods = { email: { created: 0, verified: 0, fleet: 0 }, google: { created: 0, verified: 0, fleet: 0 } };
  const verifySeconds: number[] = [];
  const finishSeconds: number[] = [];
  let stepsKnown = 0;
  const unfinished: {
    email: string | null;
    created_at: string;
    verified: boolean;
    provider: string;
    last_sign_in_at: string | null;
    step: number | null;
    step_at: string | null;
  }[] = [];

  for (const u of signups) {
    const admins = (byUser.get(u.id) ?? []).filter((m) => m.role === 'admin');
    const fleet = admins.length > 0;
    const verified = !!u.email_confirmed_at;
    const p = provider(u);
    const reached = stepOf(u);

    counts.created += 1;
    methods[p].created += 1;
    if (verified) {
      counts.verified += 1;
      methods[p].verified += 1;
      if (p === 'email') verifySeconds.push((Date.parse(u.email_confirmed_at!) - Date.parse(u.created_at)) / 1000);
    }
    if (reached > 0) stepsKnown += 1;
    // A fleet means every screen was passed, even for accounts older than step tracking.
    for (const s of onboarding) if (fleet || reached >= s.step) s.reached += 1;

    if (fleet) {
      counts.fleet += 1;
      methods[p].fleet += 1;
      const firstFleet = Math.min(...admins.map((m) => Date.parse(m.created_at)));
      finishSeconds.push((firstFleet - Date.parse(u.created_at)) / 1000);
      if (admins.some((m) => hasVehicle.has(m.organization_id))) counts.vehicle += 1;
      if (admins.some((m) => hasDriver.has(m.organization_id))) counts.driver += 1;
      if (admins.some((m) => (orgPlan.get(m.organization_id) ?? 'trial') !== 'trial')) counts.paying += 1;
    } else {
      unfinished.push({
        email: u.email ?? null,
        created_at: u.created_at,
        verified,
        provider: p,
        last_sign_in_at: u.last_sign_in_at ?? null,
        step: reached || null,
        step_at: typeof u.app_metadata?.[ONBOARDING_AT_KEY] === 'string' ? (u.app_metadata[ONBOARDING_AT_KEY] as string) : null,
      });
    }
  }

  unfinished.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const slowVerify = verifySeconds.filter((s) => s > 600).length;

  return {
    counts,
    onboarding,
    /** Accounts in the period that reported at least one onboarding screen. */
    steps_known: stepsKnown,
    methods,
    verify_seconds_median: median(verifySeconds.filter((s) => s >= 0)),
    verify_over_10min: slowVerify,
    finish_seconds_median: median(finishSeconds.filter((s) => s >= 0)),
    unfinished_total: unfinished.length,
    unfinished: unfinished.slice(0, 200),
  };
}

export async function GET(request: NextRequest) {
  if (!(await getPlatformAdmin())) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const to = new Date(sp.get('to') ?? '');
  const from = new Date(sp.get('from') ?? '');
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from >= to) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  if (to.getTime() - from.getTime() > 800 * 86_400_000) {
    return NextResponse.json({ error: 'Range too long' }, { status: 400 });
  }

  const admin = createAdminClient();
  // The two halves fail independently: accounts still show if the analytics
  // tables aren't installed, and the other way round.
  const [form, accounts] = await Promise.allSettled([formFunnel(admin, from, to), accountFunnel(admin, from, to)]);
  if (form.status === 'rejected') console.error('signup funnel (form) failed:', form.reason);
  if (accounts.status === 'rejected') console.error('signup funnel (accounts) failed:', accounts.reason);

  return NextResponse.json(
    {
      form: form.status === 'fulfilled' ? form.value : null,
      accounts: accounts.status === 'fulfilled' ? accounts.value : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
