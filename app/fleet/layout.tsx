import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { getFleetBilling } from '@/lib/billing/fleet-billing';
import { getPlans } from '@/lib/billing/plans-data';
import { getPlanDef } from '@/lib/billing/plans';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import { getFleetSettingsResolved, getUserPreferencesResolved } from '@/lib/settings/server';
import BrandingShell from '@/components/shared/BrandingShell';
import { FleetBillingProvider } from '@/components/shared/FleetBillingProvider';
import { FleetModulesProvider } from '@/components/fleet/FleetModulesProvider';
import { FleetSettingsProvider } from '@/components/fleet/FleetSettingsProvider';
import { FleetThemeRoot } from '@/components/fleet/FleetThemeRoot';
import './fleet-theme.css';

export const dynamic = 'force-dynamic';

/**
 * Fleet operator (Tier 2) gate. If the fleet's trial has expired, it has
 * outgrown its plan, or it was suspended, the whole /fleet dashboard is blocked
 * behind the upgrade screen at /billing (which lives OUTSIDE /fleet, so there is
 * no redirect loop).
 */
export default async function FleetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(['admin', 'staff']);
  const [billing, plans] = await Promise.all([getFleetBilling(user.organization_id), getPlans()]);

  // Locked = expired trial or platform suspension. Outgrowing a paid plan no
  // longer locks the dashboard (see fleet-billing.ts); it shows a banner and the
  // create endpoints refuse additions instead.
  if (billing.locked) {
    redirect('/billing');
  }

  // Which product modules this fleet has switched on (drives the sidebar, the
  // "+ New" menu and dashboard quick actions). Cached per request, so the
  // per-page module guards reuse this same read.
  // …plus the fleet's settings and this person's preferences (lib/settings),
  // all three cached per request so pages asking again reuse the same reads.
  const [enabledModules, fleetSettings, preferences] = await Promise.all([
    getEnabledModuleKeys(user.organization_id),
    getFleetSettingsResolved(user.organization_id),
    getUserPreferencesResolved(user.id),
  ]);

  return (
    <BrandingShell>
      <FleetModulesProvider enabled={Array.from(enabledModules)}>
        <FleetSettingsProvider fleet={fleetSettings} prefs={preferences}>
          <FleetBillingProvider
            value={{
              onTrial: billing.onTrial,
              trialExpired: billing.trialExpired,
              trialDaysLeft: billing.trialDaysLeft,
              overLimit: billing.overLimit,
              planName: getPlanDef(plans, billing.plan)?.name ?? billing.plan,
              requiredPlanName: getPlanDef(plans, billing.requiredPlan)?.name ?? billing.requiredPlan,
            }}
          >
            <FleetThemeRoot>{children}</FleetThemeRoot>
          </FleetBillingProvider>
        </FleetSettingsProvider>
      </FleetModulesProvider>
    </BrandingShell>
  );
}
