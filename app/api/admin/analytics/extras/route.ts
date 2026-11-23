import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlatformAdmin } from '@/lib/auth/platform';

// =============================================================================
// GET /api/admin/analytics/extras?from&to&filters — the extra website numbers
// behind Admin Console → Analytics (scroll depth, engaged visits, interactions
// by device, sections / screenshots seen, page speed, missing pages, pages read
// before signing up). Backed by analytics_extras() in
// supabase/migrations/20261123_analytics_insights.sql. Platform admin only.
// =============================================================================

export const dynamic = 'force-dynamic';

const FILTER_KEYS = new Set([
  'channel', 'source', 'referrer', 'campaign', 'utm_source', 'utm_medium', 'country', 'region',
  'city', 'device', 'browser', 'os', 'language', 'entry', 'exit', 'page',
]);

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
  if (to.getTime() - from.getTime() > 800 * 86_400_000) {
    return NextResponse.json({ error: 'Range too long' }, { status: 400 });
  }
  const filters: Record<string, string> = {};
  try {
    const raw = JSON.parse(sp.get('filters') || '{}');
    for (const [k, v] of Object.entries(raw ?? {})) {
      if (FILTER_KEYS.has(k) && typeof v === 'string' && v.length <= 300) filters[k] = v;
    }
  } catch {
    /* ignore malformed filters */
  }

  const { data, error } = await createAdminClient().rpc('analytics_extras', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_filters: filters,
  });
  if (error) {
    const setup = error.code === 'PGRST202' || error.code === '42883' || /analytics_extras/.test(error.message ?? '');
    if (!setup) console.error('analytics extras failed:', error);
    return NextResponse.json({ error: error.message, setup }, { status: setup ? 404 : 500 });
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
