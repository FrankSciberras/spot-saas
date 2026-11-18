import DeepPage from '@/components/marketing/deep/DeepPage';
import { FOR_BOLT_UBER } from '@/components/marketing/deep/content/audiences';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Fleet Management Software for Bolt & Uber Fleets — Rovora',
  description:
    'Software for ride-hailing fleet owners on Bolt, Uber and eCabs: weekly driver settlements, rosters, live map, vehicle documents and a Bolt connection.',
  path: FOR_BOLT_UBER.path,
  keywords: ['Bolt fleet management software', 'Uber fleet management software', 'ride-hailing fleet software', 'Y-plate fleet management', 'driver settlement software Bolt Uber', 'eCabs fleet software', 'fleet software Malta'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function ForBoltUberFleetsPage() {
  return <DeepPage content={FOR_BOLT_UBER} />;
}
