import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { getPlans } from '@/lib/billing/plans-data';
import { getPlanDef, requiredPlanFor } from '@/lib/billing/plans';
import { sendTrialEmail } from '@/lib/email/trial-ending';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/cron/trial-ending — daily "your free period is ending / has ended".
 *
 * For every ACTIVE fleet still on the trial plan, each ADMIN gets:
 *   trial_ending  once, when the trial ends within the next 3 days
 *   trial_ended   once, within 3 days after it ended
 * Both windows are narrow on purpose: fleets whose trial ended long before
 * this existed (or while the cron was down) are never emailed out of the blue.
 *
 * Recorded in lifecycle_emails BEFORE sending (its unique key makes a repeat
 * run a no-op); the row is removed again if the send fails, so tomorrow's run
 * retries.
 *
 *   ?dry=1   list who would be emailed without sending anything
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

const DAY = 86_400_000;
const WARN_BEFORE = 3 * DAY;
const ENDED_WITHIN = 3 * DAY;

interface Org { id: string; name: string; trial_ends_at: string }
interface AdminRow {
  user_id: string;
  users: { email: string | null; full_name: string | null } | { email: string | null; full_name: string | null }[] | null;
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';

  try {
    const admin = createAdminClient();
    const now = Date.now();
    const { data: orgs, error } = await admin
      .from('organizations')
      .select('id, name, trial_ends_at')
      .eq('plan', 'trial')
      .eq('status', 'active')
      .gte('trial_ends_at', new Date(now - ENDED_WITHIN).toISOString())
      .lte('trial_ends_at', new Date(now + WARN_BEFORE).toISOString());
    if (error) throw error;

    const plans = await getPlans();
    let emailed = 0;
    const errors: string[] = [];
    const preview: Record<string, unknown>[] = [];

    for (const org of (orgs ?? []) as Org[]) {
      const stage = Date.parse(org.trial_ends_at) > now ? 'ending' : 'ended';
      const kind = stage === 'ending' ? 'trial_ending' : 'trial_ended';

      const [admins, sent, v, d] = await Promise.all([
        admin.from('memberships').select('user_id, users:user_id (email, full_name)').eq('organization_id', org.id).eq('role', 'admin'),
        admin.from('lifecycle_emails').select('user_id').eq('organization_id', org.id).eq('kind', kind),
        admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('organization_id', org.id),
        admin.from('drivers').select('id', { count: 'exact', head: true }).eq('organization_id', org.id),
      ]);
      if (admins.error) throw admins.error;
      if (sent.error) throw sent.error; // can't tell who already got it: send nothing
      const already = new Set(((sent.data ?? []) as { user_id: string }[]).map((r) => r.user_id));
      const vehicles = v.count ?? 0;
      const drivers = d.count ?? 0;
      const planDef = plans.length ? getPlanDef(plans, requiredPlanFor(plans, drivers, vehicles)) : undefined;
      const plan = planDef
        ? { name: planDef.name, price: `${planDef.priceLabel}${planDef.priceUnit ? ` ${planDef.priceUnit}` : ''}`, custom: planDef.isCustom }
        : null;

      for (const r of (admins.data ?? []) as unknown as AdminRow[]) {
        const user = Array.isArray(r.users) ? r.users[0] : r.users;
        if (!user?.email || already.has(r.user_id)) continue;
        const input = { to: user.email, fullName: user.full_name, fleetName: org.name, stage, endsAt: org.trial_ends_at, vehicles, drivers, plan } as const;
        if (dryRun) {
          preview.push({ ...input, kind });
          continue;
        }
        const { error: claimErr } = await admin.from('lifecycle_emails').insert({ organization_id: org.id, user_id: r.user_id, kind });
        if (claimErr) {
          // 23505 = another run got there first; anything else, don't risk a duplicate.
          if (claimErr.code !== '23505') errors.push(`${user.email} (${org.name}): not sent — ${claimErr.message}`);
          continue;
        }
        if (await sendTrialEmail(input)) {
          emailed++;
        } else {
          errors.push(`${user.email} (${org.name}): send failed (${kind}), will retry tomorrow`);
          await admin.from('lifecycle_emails').delete().eq('organization_id', org.id).eq('user_id', r.user_id).eq('kind', kind);
        }
      }
    }

    const ok = errors.length === 0;
    if (!ok) console.error('trial-ending cron errors:', errors);
    return NextResponse.json(
      { ok, fleets: (orgs ?? []).length, emailed, dryRun, preview: dryRun ? preview : undefined, errors },
      { status: ok ? 200 : 500 },
    );
  } catch (error) {
    console.error('trial-ending cron failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
