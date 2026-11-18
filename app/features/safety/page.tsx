import DeepPage from '@/components/marketing/deep/DeepPage';
import { SAFETY } from '@/components/marketing/deep/content/safety';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Driver Safety Scores & Harsh Driving Alerts — Rovora',
  description:
    'Harsh braking, acceleration, cornering and speeding detected by the driver’s phone. A 0–100 safety score per driver and every event on a map. No hardware.',
  path: SAFETY.path,
  keywords: ['driver safety score', 'harsh braking detection', 'driver behaviour monitoring', 'fleet safety software', 'speeding alerts fleet', 'driver scoring without hardware'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function SafetyFeaturePage() {
  return <DeepPage content={SAFETY} />;
}
