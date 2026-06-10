import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { getFleetBilling } from '@/lib/billing/fleet-billing';
import BrandingShell from '@/components/shared/BrandingShell';
import { FleetBillingProvider } from '@/components/shared/FleetBillingProvider';
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
  const billing = await getFleetBilling(user.organization_id);

  if (billing.locked) {
    redirect('/billing');
  }

  return (
    <BrandingShell>
      <FleetBillingProvider
        value={{
          onTrial: billing.onTrial,
          trialExpired: billing.trialExpired,
          trialDaysLeft: billing.trialDaysLeft,
        }}
      >
        <FleetThemeRoot>{children}</FleetThemeRoot>
      </FleetBillingProvider>
    </BrandingShell>
  );
}
