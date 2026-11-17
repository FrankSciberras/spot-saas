// =============================================================================
// POST /api/auth/onboarding-progress — "this account reached onboarding step N".
// =============================================================================
// The onboarding wizard reports each screen it shows. The furthest one reached
// is kept on the ACCOUNT (auth app_metadata), which is how Admin Console →
// Analytics can show where sign-ups stall *inside* onboarding and list the
// people who stopped, so someone can follow up with them.
//
// Why not the marketing beacon (/api/rv): that records anonymous website
// visits and deliberately never runs inside the signed-in app. This is an
// ordinary fact about an account, like "has created a fleet" — tied to the
// signed-in user, never to the anonymous visitor hash.
//
// Why app_metadata: only the service role can write it (a browser can't forge
// it the way it could user_metadata), the admin funnel already lists auth
// users, and it needs no migration. Updates merge, so Supabase's own keys
// (provider, providers) are untouched.
//
// Always answers 204: it's fire-and-forget from the page, and tracking must
// never be able to break or slow down a sign-up.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { ONBOARDING_AT_KEY, ONBOARDING_STEPS, ONBOARDING_STEP_KEY } from '@/lib/analytics/signup-funnel';

export const dynamic = 'force-dynamic';

const MAX_STEP = ONBOARDING_STEPS.length;

function noContent() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  // Same-origin only. (The session cookie is SameSite=Lax anyway, so another
  // site's POST arrives signed out — this just says so explicitly.)
  if (request.headers.get('sec-fetch-site') === 'cross-site') return noContent();

  let step = 0;
  try {
    const text = await request.text();
    if (!text || text.length > 200) return noContent();
    step = Number((JSON.parse(text) as { step?: unknown })?.step);
  } catch {
    return noContent();
  }
  if (!Number.isInteger(step) || step < 1 || step > MAX_STEP) return noContent();

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return noContent();

    // Only ever move forward: going Back in the wizard, or returning another
    // day and starting again at step 1, must not hide how far they once got.
    const reached = Number(user.app_metadata?.[ONBOARDING_STEP_KEY]) || 0;
    if (step <= reached) return noContent();

    const { error } = await createAdminClient().auth.admin.updateUserById(user.id, {
      app_metadata: { [ONBOARDING_STEP_KEY]: step, [ONBOARDING_AT_KEY]: new Date().toISOString() },
    });
    if (error) console.error('onboarding-progress: could not save step:', error.message);
  } catch (err) {
    console.error('onboarding-progress failed:', err);
  }
  return noContent();
}
