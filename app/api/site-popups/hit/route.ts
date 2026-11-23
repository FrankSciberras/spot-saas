// =============================================================================
// POST /api/site-popups/hit — count a pop-up being shown, pressed or closed.
// =============================================================================
// Body: { id: <pop-up uuid>, k: 'view' | 'click' | 'close' }, sent as a beacon
// by components/marketing/popups/SitePopups.tsx. Adds one to that day's
// counter in site_popup_stats — no visitor data is stored at all.
//
// The same filters as the analytics beacon (/api/rv) keep the numbers honest:
// same-origin only, no bots, not the admin's own "don't count my visits"
// browser, not excluded office IPs, and a per-IP rate limit. Always 204.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isBot } from '@/lib/analytics/classify';
import { clientIp, isExcludedIp, siteHost } from '@/lib/analytics/server';
import { IGNORE_COOKIE } from '@/lib/analytics/constants';
import { UUID_RE } from '@/lib/popups/types';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['view', 'click', 'close']);
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { start: number; n: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  }
  const cur = hits.get(ip);
  if (!cur || now - cur.start > WINDOW_MS) {
    hits.set(ip, { start: now, n: 1 });
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_PER_WINDOW;
}

function noContent() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (process.env.ANALYTICS_DISABLED === '1') return noContent();
  const h = request.headers;

  const origin = h.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== siteHost(h)) return noContent();
    } catch {
      return noContent();
    }
  }
  if (h.get('sec-fetch-site') === 'cross-site') return noContent();

  const ip = clientIp(h);
  if (isBot(h.get('user-agent')) || isExcludedIp(ip) || rateLimited(ip || 'unknown')) return noContent();
  if (request.cookies.get(IGNORE_COOKIE)?.value === '1') return noContent();

  let body: { id?: unknown; k?: unknown };
  try {
    const text = await request.text();
    if (!text || text.length > 200) return noContent();
    body = JSON.parse(text);
  } catch {
    return noContent();
  }
  if (typeof body?.id !== 'string' || !UUID_RE.test(body.id) || typeof body.k !== 'string' || !KINDS.has(body.k)) {
    return noContent();
  }

  const { error } = await createAdminClient().rpc('site_popup_hit', { p_popup: body.id, p_kind: body.k });
  if (error) console.error('site popup hit not recorded:', error.message);
  return noContent();
}
