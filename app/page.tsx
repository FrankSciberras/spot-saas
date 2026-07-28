import type { Metadata } from 'next';
import { OG_IMAGE } from '@/lib/seo';
import { getPublicPlans } from '@/lib/billing/plans-data';
import LandingPage from '@/components/marketing/LandingPage';

// ISR: the page reads DB-backed plans, so revalidating hourly keeps marketing
// copy/pricing fresh while still serving a fast, cacheable static page.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Fleet Management Software for Taxi & Rideshare — Rovora',
  description:
    'All-in-one fleet management software for taxi and rideshare fleets: vehicles, maintenance, drivers, rosters, driver pay and tracking with no GPS hardware.',
  keywords: [
    'fleet management software',
    'taxi fleet management software',
    'rideshare fleet management software',
    'fleet management software for small fleets',
    'driver pay software',
    'fleet tracking without hardware',
    'vehicle maintenance tracking software',
    'driver scheduling software',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: 'Fleet Management Software for Taxi & Rideshare — Rovora',
    description:
      'All-in-one fleet management software for taxi and rideshare fleets: vehicles, maintenance, drivers, rosters, driver pay and tracking with no GPS hardware.',
    url: '/',
    siteName: 'Rovora',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fleet Management Software for Taxi & Rideshare — Rovora',
    description:
      'All-in-one fleet management software for taxi and rideshare fleets: vehicles, maintenance, drivers, rosters, driver pay and tracking with no GPS hardware.',
    images: [OG_IMAGE.url],
  },
};

/**
 * Public marketing landing page — accessible to everyone, signed in or out.
 * Logged-in visitors aren't redirected away; instead the nav swaps "Sign in"
 * for an avatar that links to their dashboard (see MarketingNav / getNavViewer).
 */
export default async function HomePage() {
  const plans = await getPublicPlans();
  return <LandingPage plans={plans} />;
}
