import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { loadMemberships } from '@/lib/auth/org-context';
import { pendingInvitesForUser } from '@/lib/invites';
import InvitesClient from './InvitesClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fleet invitations',
  robots: { index: false, follow: false },
};

/**
 * Where people who already have a Rovora account answer a fleet's invitation
 * (linked from the invite email, the dashboard banner and /dashboard itself).
 */
export default async function InvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/invites');

  const [invites, memberships] = await Promise.all([
    pendingInvitesForUser(createAdminClient(), user.id),
    loadMemberships(supabase, user.id),
  ]);

  return (
    <InvitesClient
      email={user.email ?? ''}
      hasFleet={memberships.length > 0}
      invites={invites.map((i) => ({
        id: i.id,
        organizationName: i.organization_name,
        role: i.role,
        createdAt: i.created_at,
      }))}
    />
  );
}
