import type { Metadata } from 'next';
import { OG_IMAGE } from '@/lib/seo';
import { getPlans } from '@/lib/billing/plans-data';
import LandingPage from '@/components/marketing/LandingPage';

// ISR: the page reads DB-backed plans, so revalidating hourly keeps marketing
// copy/pricing fresh while still serving a fast, cacheable static page.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Taxi & Rideshare Fleet Management Software — Rovora',
  description:
    'Rovora is all-in-one fleet management software for taxi & rideshare operators — manage vehicles, maintenance, damage, drivers, rosters, compliance and driver pay in one dashboard. Start a free trial — no card required.',
  keywords: [
    'taxi fleet management software',
    'rideshare fleet management',
    'vehicle maintenance tracking',
    'fleet damage reporting',
    'driver settlements software',
    'driver scheduling rosters',
    'fleet compliance alerts',
    'fleet management',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: 'Taxi & Rideshare Fleet Management Software — Rovora',
    description:
      'Manage vehicles, maintenance, damage, drivers, rosters, compliance and driver pay — your whole fleet in one dashboard.',
    url: '/',
    siteName: 'Rovora',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Taxi & Rideshare Fleet Management Software — Rovora',
    description:
      'Manage vehicles, maintenance, damage, drivers, rosters, compliance and driver pay — your whole fleet in one dashboard.',
    images: [OG_IMAGE.url],
  },
};

/**
 * Public marketing landing page — accessible to everyone, signed in or out.
 * Logged-in visitors aren't redirected away; instead the nav swaps "Sign in"
 * for an avatar that links to their dashboard (see MarketingNav / getNavViewer).
 */
export default async function HomePage() {
  const plans = await getPlans();
  return <LandingPage plans={plans} />;
}
