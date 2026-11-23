import DeepPage from '@/components/marketing/deep/DeepPage';
import { FOR_SMALL } from '@/components/marketing/deep/content/audiences';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Fleet Management for Small Fleets (2–10 Cars) — Rovora',
  description:
    'For owners who run a few cars and do the paperwork themselves: document reminders, service tracking, shifts, a live map and driver pay, from a phone.',
  path: FOR_SMALL.path,
  keywords: ['small fleet management software', 'fleet software for small business', 'taxi fleet software small fleet', 'fleet management app', 'vehicle document reminder software', 'owner operator fleet software'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function ForSmallFleetsPage() {
  return <DeepPage content={FOR_SMALL} />;
}
