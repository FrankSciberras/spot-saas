import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getPlatformAdmin } from '@/lib/auth/platform';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { countPendingInvites } from '@/lib/invites';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import { getUserPreferences } from '@/lib/settings/server';
import { hasArchivedDriverRecord } from '@/lib/members/archiveDriver';

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
    // Authenticated but no fleet yet. If a fleet has invited them, answer that
    // first — otherwise they'd set up a fleet of their own by mistake.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && (await countPendingInvites(createAdminClient(), user.id)) > 0) {
      redirect('/invites');
    }
    // Archived by their fleet: explain, don't offer to set up a new fleet.
    if (user && (await hasArchivedDriverRecord(user.id))) redirect('/account-archived');
    redirect('/onboarding');
  }

  if (session.role === 'driver' && !session.also_staff) {
    redirect('/driver');
  }
  redirect(await fleetStartPage(session.id, session.organization_id));
}

/**
 * Where a manager lands: their "Start page" preference (Settings →
 * Preferences), or the dashboard when the page belongs to a module the fleet
 * has switched off.
 */
const START_PAGES: Record<string, { path: string; module?: string }> = {
  dashboard: { path: '/fleet' },
  tracking: { path: '/fleet/tracking', module: 'tracking' },
  shifts: { path: '/fleet/shifts', module: 'rostering' },
  drivers: { path: '/fleet/drivers' },
  vehicles: { path: '/fleet/vehicles' },
  messages: { path: '/fleet/messages', module: 'messaging' },
};

async function fleetStartPage(userId: string, organizationId: string): Promise<string> {
  const [prefs, modules] = await Promise.all([getUserPreferences(userId), getEnabledModuleKeys(organizationId)]);
  const page = START_PAGES[prefs['navigation.start_page']];
  if (!page || (page.module && !modules.has(page.module))) return '/fleet';
  return page.path;
}
