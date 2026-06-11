import BrandingShell from '@/components/shared/BrandingShell';
import NativeBridge from '@/components/driver/NativeBridge';

export const dynamic = 'force-dynamic';

/**
 * Driver (Tier 3) layout. Drivers don't get their own gate (the pages handle
 * auth), but they DO inherit their fleet's branding — logo + accent colour —
 * so a driver's dashboard looks the same as the operator's.
 */
export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BrandingShell>
      <NativeBridge />
      {children}
    </BrandingShell>
  );
}
