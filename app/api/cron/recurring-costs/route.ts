import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { postDueRecurringCosts } from '@/lib/bookkeeping/recurring';

/**
 * GET /api/cron/recurring-costs
 * Post every recurring vehicle cost (lease, insurance, road tax…) that has
 * fallen due, for every fleet, as a finance_transactions line — the
 * repeating-bill behaviour. Idempotent: the DB has a unique index per
 * (cost, due date), and each cost records the last date it was posted through.
 *
 * The Bookkeeping and Financials pages also run this for the viewing fleet on
 * load, so a fleet is never behind when someone looks; this job keeps every
 * fleet current even when nobody does.
 *
 * Authorization (either is accepted):
 *   1. A scheduler presents the shared secret:
 *        Authorization: Bearer <CRON_SECRET>   (or  ?secret=<CRON_SECRET>)
 *   2. A signed-in platform admin (so it can be triggered manually).
 * If CRON_SECRET is unset, only a platform admin can run it (never left open).
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

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await postDueRecurringCosts(createAdminClient(), null);
    return NextResponse.json({ ok: result.errors.length === 0, ...result });
  } catch (error) {
    console.error('Error in GET /api/cron/recurring-costs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
