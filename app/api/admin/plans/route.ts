import { NextResponse } from 'next/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/plans — platform-admin only.
 * Returns ALL packages (incl. unpublished drafts) for the Packages manager in
 * the admin console, with a count of operators currently on each.
 */
export async function GET() {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: plans }, { data: orgs }] = await Promise.all([
    admin.from('plans').select('*').order('sort_order', { ascending: true }),
    admin.from('organizations').select('plan'),
  ]);

  const onPlan = new Map<string, number>();
  for (const o of (orgs ?? []) as { plan: string | null }[]) {
    if (o.plan) onPlan.set(o.plan, (onPlan.get(o.plan) ?? 0) + 1);
  }

  const data = ((plans ?? []) as { key: string }[]).map((p) => ({
    ...p,
    operatorCount: onPlan.get(p.key) ?? 0,
  }));

  return NextResponse.json({ data });
}
