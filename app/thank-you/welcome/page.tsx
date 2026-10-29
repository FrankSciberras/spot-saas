import type { Metadata } from 'next';
import ThankYou from '../ThankYou';

export const metadata: Metadata = {
  title: 'Welcome to Rovora',
  robots: { index: false, follow: false },
};

/** Landing stop after a new fleet is created on the free plan (from /onboarding). */
export default function WelcomeThankYouPage() {
  return (
    <ThankYou
      heading="Your fleet is ready"
      sub="Welcome to Rovora. You can start adding drivers and vehicles straight away, no card needed."
      next="/fleet"
    />
  );
}
