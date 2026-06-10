import { getPlans } from '@/lib/billing/plans-data';
import LandingPage from '@/components/marketing/LandingPage';

export const dynamic = 'force-dynamic';

/**
 * Public marketing landing page — accessible to everyone, signed in or out.
 * Logged-in visitors aren't redirected away; instead the nav swaps "Sign in"
 * for an avatar that links to their dashboard (see MarketingNav / getNavViewer).
 */
export default async function HomePage() {
  const plans = await getPlans();
  return <LandingPage plans={plans} />;
}
