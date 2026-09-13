import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { sendInactivityEmail } from '@/lib/email/inactivity';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/cron/inactivity — daily "need a hand?" check-in.
 *
 * For every ACTIVE fleet, each ADMIN who:
 *   - joined at least INACTIVE_DAYS ago, and
 *   - last signed in between INACTIVE_DAYS and MAX_INACTIVE_DAYS ago (Supabase
 *     auth last_sign_in_at; never-signed-in counts from when they joined), and
 *   - has not already received this email for this fleet
 * gets one email tailored to how far they got with setup. Recorded in
 * lifecycle_emails, so it is sent exactly once per admin per fleet.
 *
 * Authorization: Bearer CRON_SECRET, or a signed-in platform admin.
 */
async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization');
    const url = new URL(request.url);
    if (header === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  return isPlatformAdmin();
}

const INACTIVE_DAYS = 7;
/**
 * Upper bound of the window. A check-in "about a week" after someone drifted
 * away is helpful; the same email 100 days later to a long-abandoned test
 * account is spam. Anyone already past this when the feature launched (or when
 * the cron was down) is simply never emailed.
 */
const MAX_INACTIVE_DAYS = 21;
const KIND = 'inactive_7d';
const DAY = 86_400_000;

interface AdminRow {
  user_id: string;
  organization_id: string;
  created_at: string;
  users: { email: string | null; full_name: string | null } | { email: string | null; full_name: string | null }[] | null;
  organizations:
    | { name: string; status: string; plan: string; trial_ends_at: string | null; created_at: string }
    | { name: string; status: string; plan: string; trial_ends_at: string | null; created_at: string }[]
    | null;
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';

  try {
    const admin = createAdminClient();
    const now = Date.now();
    const cutoff = now - INACTIVE_DAYS * DAY;
    const floor = now - MAX_INACTIVE_DAYS * DAY;

    // Every admin membership, with the person and the fleet.
    const { data: rows, error } = await admin
      .from('memberships')
      .select('user_id, organization_id, created_at, users:user_id (email, full_name), organizations:organization_id (name, status, plan, trial_ends_at, created_at)')
      .eq('role', 'admin');
    if (error) throw error;

    // Last sign-in per user, from Supabase Auth (paged; small user base).
    const lastSignIn = new Map<string, number>();
    for (let page = 1; page <= 20; page++) {
      const { data, error: authErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (authErr) throw authErr;
      for (const u of data.users) {
        lastSignIn.set(u.id, u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0);
      }
      if (data.users.length < 1000) break;
    }

    // Already sent.
    const { data: sentRows } = await admin.from('lifecycle_emails').select('organization_id, user_id').eq('kind', KIND);
    const sent = new Set((sentRows ?? []).map((r) => `${r.organization_id}:${r.user_id}`));

    const candidates = ((rows ?? []) as unknown as AdminRow[]).filter((r) => {
      const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
      const user = Array.isArray(r.users) ? r.users[0] : r.users;
      if (!org || !user?.email) return false;
      if (org.status !== 'active') return false;
      if (sent.has(`${r.organization_id}:${r.user_id}`)) return false;
      if (Date.parse(r.created_at) > cutoff) return false; // joined less than 7 days ago
      const last = lastSignIn.get(r.user_id) ?? 0;
      const reference = Math.max(last, Date.parse(r.created_at));
      return reference <= cutoff && reference >= floor;
    });

    let emailed = 0;
    const errors: string[] = [];
    const preview: Record<string, unknown>[] = [];

    for (const r of candidates) {
      const org = (Array.isArray(r.organizations) ? r.organizations[0] : r.organizations)!;
      const user = (Array.isArray(r.users) ? r.users[0] : r.users)!;
      const orgId = r.organization_id;

      const [v, d, s] = await Promise.all([
        admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        admin.from('drivers').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
        admin.from('driver_settlements').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      ]);

      const last = lastSignIn.get(r.user_id) ?? 0;
      const daysAway = Math.floor((now - Math.max(last, Date.parse(r.created_at))) / DAY);
      const onTrial = org.plan === 'trial';
      const trialDaysLeft = onTrial && org.trial_ends_at ? Math.max(0, Math.ceil((Date.parse(org.trial_ends_at) - now) / DAY)) : 0;

      const input = {
        to: user.email!,
        fullName: user.full_name,
        fleetName: org.name,
        daysAway,
        vehicles: v.count ?? 0,
        drivers: d.count ?? 0,
        settlements: s.count ?? 0,
        onTrial,
        trialDaysLeft,
      };

      if (dryRun) {
        preview.push(input);
        continue;
      }

      const ok = await sendInactivityEmail(input);
      if (!ok) {
        errors.push(`${user.email} (${org.name}): send failed`);
        continue;
      }
      const { error: recErr } = await admin.from('lifecycle_emails').insert({ organization_id: orgId, user_id: r.user_id, kind: KIND });
      if (recErr) errors.push(`${user.email}: sent but not recorded — ${recErr.message}`);
      emailed++;
    }

    const ok = errors.length === 0;
    if (!ok) console.error('inactivity cron errors:', errors);
    return NextResponse.json(
      { ok, checked: (rows ?? []).length, candidates: candidates.length, emailed, dryRun, preview: dryRun ? preview : undefined, errors },
      { status: ok ? 200 : 500 },
    );
  } catch (error) {
    console.error('inactivity cron failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
