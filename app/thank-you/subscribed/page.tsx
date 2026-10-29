import type { Metadata } from 'next';
import ThankYou from '../ThankYou';

export const metadata: Metadata = {
  title: 'Thank you for subscribing',
  robots: { index: false, follow: false },
};

/**
 * Stripe Checkout's success_url. Carries ?plan=<plan key> so GTM can tell
 * plans apart; the plan itself is activated by the Stripe webhook.
 */
export default function SubscribedThankYouPage() {
  return (
    <ThankYou
      heading="Thank you for subscribing"
      sub="Payment received. Your plan is being switched on now."
      next="/billing?checkout=success"
    />
  );
}
