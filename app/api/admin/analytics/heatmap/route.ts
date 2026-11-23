import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlatformAdmin } from '@/lib/auth/platform';

// =============================================================================
// GET /api/admin/analytics/heatmap?from&to[&path][&layout][&filters]
//
// Without `path`: every public page with clicks in the window (Admin Console →
// Analytics → Heatmaps list). With `path`: every click on that page — newest
// 20 000 — for one screen size (`layout` = phone | tablet | desktop) or all,
// plus the elements, visits and page-view numbers the viewer draws from.
// Backed by analytics_heatmap() in supabase/migrations/20261124_heatmaps.sql.
// Platform admin only.
// =============================================================================

export const dynamic = 'force-dynamic';

const FILTER_KEYS = new Set([
  'channel', 'source', 'campaign', 'utm_source', 'utm_medium', 'country', 'region', 'city', 'device', 'browser', 'os',
]);
const LAYOUTS = new Set(['phone', 'tablet', 'desktop']);

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
  const rawPath = sp.get('path');
  const path = rawPath && rawPath.startsWith('/') && rawPath.length <= 300 ? rawPath : null;
  const layout = LAYOUTS.has(sp.get('layout') ?? '') ? sp.get('layout') : null;

  const filters: Record<string, string> = {};
  try {
    const raw = JSON.parse(sp.get('filters') || '{}');
    for (const [k, v] of Object.entries(raw ?? {})) {
      if (FILTER_KEYS.has(k) && typeof v === 'string' && v.length <= 300) filters[k] = v;
    }
  } catch {
    /* ignore malformed filters */
  }

  const { data, error } = await createAdminClient().rpc('analytics_heatmap', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_path: path,
    p_layout: layout,
    p_filters: filters,
  });
  if (error) {
    const setup = error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || /analytics_heatmap|analytics_clicks/.test(error.message ?? '');
    if (!setup) console.error('analytics heatmap failed:', error);
    return NextResponse.json({ error: error.message, setup }, { status: setup ? 404 : 500 });
  }
  return NextResponse.json(
    { ...(data as Record<string, unknown>), popups: await popupNames(data), generatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Names of the website pop-ups clicked on this page (elements carry `p`, the
 * pop-up's id — see components/marketing/popups). Empty if none, or before
 * supabase/migrations/20261123_site_popups.sql has run.
 */
async function popupNames(data: unknown): Promise<{ id: string; name: string }[]> {
  const elements = (data as { elements?: { p?: string | null }[] } | null)?.elements;
  const ids = [...new Set((elements ?? []).map((e) => e.p).filter((p): p is string => typeof p === 'string'))];
  if (!ids.length) return [];
  const { data: rows, error } = await createAdminClient().from('site_popups').select('id, name').in('id', ids.slice(0, 100));
  const names = new Map((error ? [] : rows ?? []).map((r) => [String(r.id), String(r.name)]));
  return ids.map((id) => ({ id, name: names.get(id) ?? 'Deleted pop-up' }));
}
