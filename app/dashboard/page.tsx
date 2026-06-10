import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getPlatformAdmin } from '@/lib/auth/platform';

export const dynamic = 'force-dynamic';

/**
 * Post-login resolver. The marketing home page (`/`) no longer redirects signed-in
 * visitors — they can browse it freely — so login sends users here instead, and
 * this routes each to their correct dashboard by tier:
 *   platform admin -> /admin   driver (only) -> /driver   everyone else -> /fleet
 * Unauthenticated hits are bounced to /login by the proxy before reaching this.
 */
export default async function DashboardResolver() {
  const platformAdmin = await getPlatformAdmin();
  if (platformAdmin) redirect('/admin');

  const session = await getSession();
  if (!session) {
    // Authenticated but no fleet yet → onboarding; truly signed out → login.
    redirect('/onboarding');
  }

  if (session.role === 'driver' && !session.also_staff) {
    redirect('/driver');
  }
  redirect('/fleet');
}
