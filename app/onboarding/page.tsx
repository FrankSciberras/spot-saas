import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadMemberships } from '@/lib/auth/org-context';
import { getTrialCopy } from '@/lib/billing/trial-offer-data';
import { hasArchivedDriverRecord } from '@/lib/members/archiveDriver';
import OnboardingForm from './OnboardingForm';

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
  // A driver their fleet archived has no fleet to set up here.
  if (await hasArchivedDriverRecord(user.id)) redirect('/account-archived');

  return <OnboardingForm trial={await getTrialCopy()} />;
}
