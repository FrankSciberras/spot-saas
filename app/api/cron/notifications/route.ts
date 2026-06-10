import { NextResponse } from 'next/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { evaluateNotificationRules } from '@/lib/notifications/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Runs the automated notification rules engine across ALL orgs.
 *
 * Authorization (either is accepted):
 *   1. A scheduler presents the shared secret:
 *        Authorization: Bearer <CRON_SECRET>   (or  ?secret=<CRON_SECRET>)
 *   2. A signed-in platform admin (so it can be triggered manually from /admin).
 *
 * If CRON_SECRET is unset, only a platform admin can run it (never left open).
 * Wire your scheduler (Vercel Cron, GitHub Actions, cron-job.org, …) to call
 * this daily.
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

async function run(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const report = await evaluateNotificationRules();
  return NextResponse.json({ ok: true, report });
}

export async function POST(request: Request) {
  return run(request);
}

// GET supported too so simple schedulers (and a browser check by an admin) work.
export async function GET(request: Request) {
  return run(request);
}
