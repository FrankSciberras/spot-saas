import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlatformAdmin } from '@/lib/auth/platform';
import { IGNORE_COOKIE, IGNORE_MAX_AGE } from '@/lib/analytics/constants';

// Website analytics for the platform admin (Admin Console → Analytics).
//   GET  ?from&to&prevFrom&tz&bucket&filters → the full dashboard for a date range
//   GET  ?live=1                     → who's on the site right now
//   POST {"exclude": true|false}     → stop/start counting this browser's visits

export const dynamic = 'force-dynamic';

const FILTER_KEYS = new Set([
  'channel', 'source', 'referrer', 'campaign', 'utm_source', 'utm_medium', 'country', 'region',
  'city', 'device', 'browser', 'os', 'language', 'entry', 'exit', 'page',
]);
const BUCKETS = new Set(['hour', 'day', 'week', 'month']);

interface Conversion {
  type: 'Signup' | 'Lead';
  props: { org_id?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export async function GET(request: NextRequest) {
  if (!(await getPlatformAdmin())) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const admin = createAdminClient();
  const ignored = request.cookies.get(IGNORE_COOKIE)?.value === '1';

  if (sp.get('live') === '1') {
    const { data, error } = await admin.rpc('analytics_realtime');
    if (error) return NextResponse.json({ error: error.message, setup: isMissing(error) }, { status: 500 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  }

  const to = new Date(sp.get('to') ?? '');
  const from = new Date(sp.get('from') ?? '');
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from >= to) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  if (to.getTime() - from.getTime() > 800 * 86_400_000) {
    return NextResponse.json({ error: 'Range too long' }, { status: 400 });
  }
  // Start of the comparison period (same length), e.g. yesterday 00:00 for
  // "today so far". Defaults to the stretch right before `from`.
  const prevFromRaw = sp.get('prevFrom');
  const prevFrom = prevFromRaw ? new Date(prevFromRaw) : null;
  if (prevFrom && (Number.isNaN(prevFrom.getTime()) || prevFrom >= from)) {
    return NextResponse.json({ error: 'Invalid comparison period' }, { status: 400 });
  }
  const bucket = BUCKETS.has(sp.get('bucket') ?? '') ? sp.get('bucket')! : 'day';
  const tz = (sp.get('tz') ?? 'UTC').slice(0, 64);

  const filters: Record<string, string> = {};
  try {
    const raw = JSON.parse(sp.get('filters') || '{}');
    for (const [k, v] of Object.entries(raw ?? {})) {
      if (FILTER_KEYS.has(k) && typeof v === 'string' && v.length <= 300) filters[k] = v;
    }
  } catch {
    /* ignore malformed filters */
  }

  const { data, error } = await admin.rpc('analytics_dashboard', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tz: tz,
    p_bucket: bucket,
    p_filters: filters,
    p_prev_from: prevFrom ? prevFrom.toISOString() : null,
  });
  if (error) {
    console.error('analytics dashboard failed:', error);
    return NextResponse.json({ error: error.message, setup: isMissing(error) }, { status: 500 });
  }

  // Put names on the fleets that signed up.
  const conversions = ((data?.conversions ?? []) as Conversion[]);
  const orgIds = [...new Set(conversions.map((c) => c.props?.org_id).filter((v): v is string => typeof v === 'string'))];
  const orgs: Record<string, { name: string; plan: string | null; status: string | null }> = {};
  if (orgIds.length > 0) {
    const { data: rows } = await admin.from('organizations').select('id, name, plan, status').in('id', orgIds);
    for (const o of (rows ?? []) as { id: string; name: string; plan: string | null; status: string | null }[]) {
      orgs[o.id] = { name: o.name, plan: o.plan, status: o.status };
    }
  }

  return NextResponse.json({ ...data, orgs, ignored }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!(await getPlatformAdmin())) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }
  let exclude = false;
  try {
    exclude = Boolean((await request.json())?.exclude);
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const res = NextResponse.json({ ignored: exclude });
  const secure = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set(IGNORE_COOKIE, exclude ? '1' : '', {
    path: '/',
    sameSite: 'lax',
    secure,
    maxAge: exclude ? IGNORE_MAX_AGE : 0,
  });
  return res;
}

/** True when the analytics migration hasn't been applied yet. */
function isMissing(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /analytics_(dashboard|realtime)/.test(error.message ?? '');
}
