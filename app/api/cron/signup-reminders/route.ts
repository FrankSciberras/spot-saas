import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { getCurrentTrialDays } from '@/lib/billing/trial-offer-data';
import { sendSignupReminderEmail } from '@/lib/email/signup-reminder';
import { ONBOARDING_STEP_KEY, SIGNUP_NUDGE_AT_KEY, SIGNUP_NUDGE_KEY } from '@/lib/analytics/signup-funnel';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/cron/signup-reminders — hourly nudge for sign-ups that stalled.
 *
 * Looks at self-serve accounts that still have NO fleet:
 *   round 1  created 1 hour – 2 days ago, nothing sent yet
 *   round 2  created 3 – 10 days ago, round 1 sent at least 2 days ago,
 *            and only if the email address was verified
 * So nobody gets more than two, an unverified address gets exactly one, and
 * accounts older than the windows (everyone from before this existed, or from
 * while the cron was down) are never emailed.
 *
 * Left out entirely: people invited to a fleet, anyone with a membership or a
 * pending invite, and platform admins.
 *
 * What was sent is recorded on the account (auth app_metadata), like the
 * onboarding step — no migration, and it can't be sent twice.
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ROUND1 = { min: 1 * HOUR, max: 2 * DAY };
const ROUND2 = { min: 3 * DAY, max: 10 * DAY, sinceFirst: 2 * DAY };
/** A stuck or abused sign-up form must not turn this into a mail cannon. */
const MAX_PER_RUN = 40;

interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  app_metadata?: Record<string, unknown>;
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.SIGNUP_REMINDERS_DISABLED === '1') {
    return NextResponse.json({ ok: true, disabled: true });
  }
  const dryRun = new URL(request.url).searchParams.get('dry') === '1';

  try {
    const admin = createAdminClient();
    const now = Date.now();

    const users: AuthUser[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      users.push(...(data.users as unknown as AuthUser[]));
      if (data.users.length < 1000) break;
    }

    // Round to send for each account still inside a window, by age alone.
    const due = users
      .map((u) => {
        const age = now - Date.parse(u.created_at);
        const sent = Number(u.app_metadata?.[SIGNUP_NUDGE_KEY]) || 0;
        const sentAt = Date.parse(String(u.app_metadata?.[SIGNUP_NUDGE_AT_KEY] ?? '')) || 0;
        let round: 1 | 2 | null = null;
        if (sent === 0 && age >= ROUND1.min && age <= ROUND1.max) round = 1;
        else if (sent === 1 && u.email_confirmed_at && age >= ROUND2.min && age <= ROUND2.max && now - sentAt >= ROUND2.sinceFirst) round = 2;
        return { u, round };
      })
      .filter((x): x is { u: AuthUser; round: 1 | 2 } => x.round !== null && !!x.u.email && !x.u.invited_at);

    // Drop anyone who belongs to a fleet, has been invited to one, or runs the platform.
    const ids = due.map((x) => x.u.id);
    const skip = new Set<string>();
    for (let i = 0; i < ids.length; i += 150) {
      const part = ids.slice(i, i + 150);
      const [members, invites, admins] = await Promise.all([
        admin.from('memberships').select('user_id').in('user_id', part),
        admin.from('membership_invites').select('user_id').in('user_id', part).eq('status', 'pending'),
        admin.from('platform_admins').select('user_id').in('user_id', part),
      ]);
      // If we can't tell who has a fleet, send nothing rather than nag customers.
      if (members.error) throw members.error;
      for (const r of [...(members.data ?? []), ...(invites.data ?? []), ...(admins.data ?? [])] as { user_id: string }[]) skip.add(r.user_id);
    }
    const candidates = due.filter((x) => !skip.has(x.u.id));

    const trialDays = await getCurrentTrialDays();
    let emailed = 0;
    const errors: string[] = [];
    const preview: Record<string, unknown>[] = [];

    for (const { u, round } of candidates.slice(0, MAX_PER_RUN)) {
      const input = {
        to: u.email!,
        stage: u.email_confirmed_at ? ('no_fleet' as const) : ('unverified' as const),
        round,
        step: Number(u.app_metadata?.[ONBOARDING_STEP_KEY]) || null,
        trialDays,
      };
      if (dryRun) {
        preview.push({ ...input, created_at: u.created_at });
        continue;
      }

      // Record first, then send: if the two ever disagree, a missed reminder is
      // better than the same person being emailed every hour.
      const { error: recErr } = await admin.auth.admin.updateUserById(u.id, {
        app_metadata: { [SIGNUP_NUDGE_KEY]: round, [SIGNUP_NUDGE_AT_KEY]: new Date().toISOString() },
      });
      if (recErr) {
        errors.push(`${u.email}: not sent — could not record it (${recErr.message})`);
        continue;
      }
      if (await sendSignupReminderEmail(input)) emailed++;
      else errors.push(`${u.email}: send failed (round ${round})`);
    }

    const ok = errors.length === 0;
    if (!ok) console.error('signup-reminders cron errors:', errors);
    return NextResponse.json(
      { ok, checked: users.length, candidates: candidates.length, emailed, dryRun, preview: dryRun ? preview : undefined, errors },
      { status: ok ? 200 : 500 },
    );
  } catch (error) {
    console.error('signup-reminders cron failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
