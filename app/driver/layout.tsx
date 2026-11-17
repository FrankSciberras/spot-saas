import BrandingShell from '@/components/shared/BrandingShell';
import NativeBridge from '@/components/driver/NativeBridge';
import ShiftCheckConfirmer from '@/components/driver/ShiftCheckConfirmer';
import { FleetThemeRoot } from '@/components/fleet/FleetThemeRoot';
import { FleetSettingsProvider } from '@/components/fleet/FleetSettingsProvider';
import { getSession } from '@/lib/auth/session';
import { getFleetSettingsResolved, getUserPreferencesResolved } from '@/lib/settings/server';
import '../fleet/fleet-theme.css';

export const dynamic = 'force-dynamic';

/**
 * Driver (Tier 3) layout. Drivers don't get their own gate (the pages handle
 * auth), but they DO inherit their fleet's branding — logo + accent colour —
 * so a driver's dashboard looks the same as the operator's.
 *
 * FleetThemeRoot gives the driver area the same standalone design system
 * (tokens + dark/light toggle) as /fleet; pages render inside
 * <FleetShell variant="driver"> to opt into the visual canvas.
 */
export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const content = (
    <FleetThemeRoot>
      {/* Opening the portal answers "Are you still on shift?" */}
      <ShiftCheckConfirmer />
      {children}
    </FleetThemeRoot>
  );

  // The fleet's settings (go-online checklist, document warnings, …) and the
  // driver's own preferences (theme). Signed-out visitors are sent to /login by
  // the pages; they just get the defaults here.
  const session = await getSession();
  if (!session) {
    return (
      <BrandingShell>
        <NativeBridge />
        {content}
      </BrandingShell>
    );
  }
  const [fleet, prefs] = await Promise.all([
    getFleetSettingsResolved(session.organization_id),
    getUserPreferencesResolved(session.id),
  ]);

  return (
    <BrandingShell>
      <NativeBridge />
      <FleetSettingsProvider fleet={fleet} prefs={prefs}>
        {content}
      </FleetSettingsProvider>
    </BrandingShell>
  );
}
