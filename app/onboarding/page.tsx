import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadMemberships } from '@/lib/auth/org-context';
import { getPlans } from '@/lib/billing/plans-data';
import OnboardingWizard from './OnboardingWizard';

export const dynamic = 'force-dynamic';

/**
 * Self-serve onboarding. A signed-in user who belongs to NO organization lands
 * here (sent by requireAuth) to create their first fleet. Users who already
 * have a membership are bounced to their dashboard.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const memberships = await loadMemberships(supabase, user.id);
  if (memberships.length > 0) {
    redirect('/');
  }

  const plans = await getPlans();
  return <OnboardingWizard plans={plans} />;
}
