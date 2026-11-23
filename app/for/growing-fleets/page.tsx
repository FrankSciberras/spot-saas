import DeepPage from '@/components/marketing/deep/DeepPage';
import { FOR_GROWING } from '@/components/marketing/deep/content/audiences';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Fleet Management for Growing Fleets (10–75 Cars) — Rovora',
  description:
    'For fleets with office staff: per-person permissions, an audit log, settlements for dozens of drivers, safety scores, a Bolt connection and an API.',
  path: FOR_GROWING.path,
  keywords: ['fleet management software for growing fleets', 'fleet software with staff permissions', 'taxi fleet management system', 'fleet audit log', 'fleet management API', 'mid-size fleet software'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function ForGrowingFleetsPage() {
  return <DeepPage content={FOR_GROWING} />;
}
