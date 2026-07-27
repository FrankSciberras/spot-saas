import { NextResponse } from 'next/server';
import { getNavViewer } from '@/lib/auth/viewer';

/**
 * GET /api/nav-viewer — who is signed in, for the marketing nav avatar only.
 *
 * The marketing nav used to resolve this in a server component, which read
 * cookies and therefore forced EVERY marketing page into dynamic rendering
 * (`Cache-Control: private, no-store`). Moving the lookup behind a fetch lets
 * the marketing pages stay static/ISR and CDN-cacheable, which is what search
 * crawlers and first-time visitors actually get served.
 *
 * Returns only the signed-in user's own identity, so there is nothing to leak
 * across tenants; signed-out callers get `{ viewer: null }`.
 */
export async function GET() {
  const viewer = await getNavViewer();

  return NextResponse.json(
    { viewer },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
