import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify your email',
  robots: { index: false, follow: false },
  // The page reads a sign-in token from the URL fragment; never leak the URL.
  referrer: 'no-referrer',
};

export default function ConfirmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
