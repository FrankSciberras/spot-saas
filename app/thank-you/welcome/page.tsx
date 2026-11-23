import type { Metadata } from 'next';
import ThankYou from '../ThankYou';

export const metadata: Metadata = {
  title: 'Welcome to Rovora',
  robots: { index: false, follow: false },
};

/**
 * Landing stop after a new fleet is created on the free plan (from /onboarding).
 * `?next=bolt` (the fleet said it works with Bolt) forwards to the Bolt page,
 * where connecting brings the whole fleet in, instead of an empty dashboard.
 * Only that one fixed value is honoured — never a free-form URL.
 */
export default async function WelcomeThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  if (next === 'bolt') {
    return (
      <ThankYou
        heading="Your fleet is ready"
        sub="Next: connect your Bolt account and bring all your drivers and cars across in one go — no typing, no card needed."
        next="/fleet/bolt"
      />
    );
  }

  return (
    <ThankYou
      heading="Your fleet is ready"
      sub="Welcome to Rovora. You can start adding drivers and vehicles straight away, no card needed."
      next="/fleet"
    />
  );
}
