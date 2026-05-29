import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getPlatformAdmin } from '@/lib/auth/platform';
import LandingPage from '@/components/marketing/LandingPage';

export const dynamic = 'force-dynamic';

/**
 * Public marketing landing page.
 * Logged-in users are routed straight to their dashboard by tier:
 *   platform admin -> /admin   fleet operator -> /fleet   driver -> /driver
 */
export default async function HomePage() {
  // Tier 1: the SaaS operator. Checked first and independently of fleet
  // membership, so a pure platform admin (no fleet) still lands somewhere.
  const platformAdmin = await getPlatformAdmin();
  if (platformAdmin) {
    redirect('/admin');
  }

  const session = await getSession();

  if (session) {
    if (session.role === 'driver' && !session.also_staff) {
      redirect('/driver');
    }
    redirect('/fleet');
  }

  return <LandingPage />;
}
