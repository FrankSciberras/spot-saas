import DeepPage from '@/components/marketing/deep/DeepPage';
import { BOLT } from '@/components/marketing/deep/content/bolt';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Bolt Fleet Integration: Rides, Fares & Drivers — Rovora',
  description:
    'Connect your Bolt fleet account to Rovora with a Fleet API key: rides, fares, tips, acceptance and who is online, per driver and per car, refreshed hourly.',
  path: BOLT.path,
  keywords: ['Bolt fleet integration', 'Bolt Fleet API', 'Bolt fleet management software', 'Bolt driver earnings report', 'Bolt fleet dashboard', 'Bolt fleet owner software'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function BoltFeaturePage() {
  return <DeepPage content={BOLT} />;
}
