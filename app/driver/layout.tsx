import BrandingShell from '@/components/shared/BrandingShell';
import NativeBridge from '@/components/driver/NativeBridge';
import { FleetThemeRoot } from '@/components/fleet/FleetThemeRoot';
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
  return (
    <BrandingShell>
      <NativeBridge />
      <FleetThemeRoot>{children}</FleetThemeRoot>
    </BrandingShell>
  );
}
