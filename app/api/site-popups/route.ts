// =============================================================================
// GET /api/site-popups — the pop-ups the public website may show right now.
// =============================================================================
// Called once per page load by components/marketing/popups/SitePopups.tsx,
// which then decides per page which one (if any) to open, and when.
//
//   GET /api/site-popups                 every live pop-up (switched on and
//                                        inside its dates), best first
//   GET /api/site-popups?preview=<id>    that one pop-up whatever its state —
//                                        platform admins only (the admin
//                                        preview and the heatmap viewer)
//
// Only fields the website needs are returned; drafts never leave the server.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getPlatformAdmin } from '@/lib/auth/platform';
import { getLivePopups, getPopupById } from '@/lib/popups/server';
import { UUID_RE, toPublicPopup } from '@/lib/popups/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const preview = request.nextUrl.searchParams.get('preview');

  if (preview !== null) {
    const none = NextResponse.json({ popups: [] }, { headers: { 'Cache-Control': 'no-store' } });
    if (!UUID_RE.test(preview)) return none;
    const admin = await getPlatformAdmin().catch(() => null);
    if (!admin) return none;
    const popup = await getPopupById(preview);
    return NextResponse.json(
      { popups: popup ? [toPublicPopup(popup)] : [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const popups = await getLivePopups().catch(() => []);
  return NextResponse.json(
    { popups },
    { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } },
  );
}
