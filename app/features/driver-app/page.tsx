import DeepPage from '@/components/marketing/deep/DeepPage';
import { DRIVER_APP } from '@/components/marketing/deep/content/driver-app';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Driver App for Taxi & Ride-Hailing Fleets — Rovora',
  description:
    'The free Rovora Driver app: start and end shifts, pre-shift checks, roster, earnings, weekly settlements and messages. Android on Google Play, or any browser.',
  path: DRIVER_APP.path,
  keywords: ['fleet driver app', 'taxi driver app for fleets', 'driver shift app', 'driver check-in app', 'pre-shift vehicle check app', 'Rovora Driver'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function DriverAppFeaturePage() {
  return <DeepPage content={DRIVER_APP} />;
}
