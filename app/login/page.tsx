import type { Metadata } from 'next';
import { getTrialCopy } from '@/lib/billing/trial-offer-data';
import { liveTestimonials } from '@/components/marketing/testimonials';
import LoginClient from './LoginClient';

// The trial offer (length, running promo) is admin-editable; refresh it hourly
// like the other marketing pages rather than baking it in at build time.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Sign in or get started free',
};

export default async function LoginPage() {
  const trial = await getTrialCopy();
  // Only real, approved quotes (see components/marketing/testimonials.ts).
  const testimonial = liveTestimonials()[0] ?? null;
  return <LoginClient trial={trial} testimonial={testimonial} />;
}
