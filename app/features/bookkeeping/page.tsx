import DeepPage from '@/components/marketing/deep/DeepPage';
import { BOOKKEEPING } from '@/components/marketing/deep/content/bookkeeping';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Fleet Bookkeeping & Expense Tracking Software — Rovora',
  description:
    'Record every fleet expense and income the day it happens, with receipt photos, your own categories and recurring vehicle costs. Export to Xero or QuickBooks.',
  path: BOOKKEEPING.path,
  keywords: ['fleet bookkeeping software', 'fleet expense tracking', 'taxi fleet accounting', 'vehicle cost tracking', 'fleet profit per vehicle', 'Xero QuickBooks fleet export'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function BookkeepingFeaturePage() {
  return <DeepPage content={BOOKKEEPING} />;
}
