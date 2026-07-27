import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';
import './rovora-site.css';
import ServiceWorkerRegistration from '@/components/shared/ServiceWorkerRegistration';
import ErrorRecovery from '@/components/shared/ErrorRecovery';
import SplashScreen from '@/components/shared/SplashScreen';
import { ThemeProvider } from '@/components/shared/ThemeProvider';

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://rovora.eu'),
  applicationName: 'Rovora',
  // `template` brands every page that sets a bare title (and the whole signed-in
  // app) without each one hand-appending " — Rovora"; `default` covers routes
  // that set no title at all. Pages that need full control over the 60-char
  // budget still set `title.absolute` via marketingMetadata().
  title: {
    default: 'Rovora — Fleet Management Software for Taxi & Rideshare',
    template: '%s — Rovora',
  },
  description: 'Fleet management software for taxi and rideshare operators. Track vehicles, maintenance, damage, rosters and driver pay in one dashboard.',
  authors: [{ name: 'Rovora', url: 'https://rovora.eu' }],
  creator: 'Rovora',
  publisher: 'Rovora',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'Rovora',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Rovora — fleet management software' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Rovora',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2e7fdb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/*
        The inline <head> style block that used to live here is gone. It defined
        a `.splash-fallback` class no component ever applied, and its
        `body { background: #0a0c11 }` beat the theme-aware
        `body { background: var(--bg-secondary) }` in globals.css purely because
        Next emits inline styles after the stylesheet links — painting a dark
        canvas behind the light marketing site. `margin: 0` is already covered by
        the universal reset in globals.css.
      */}
      <body className={figtree.className}>
        <ThemeProvider>
          <ServiceWorkerRegistration />
          <SplashScreen>
            {children}
          </SplashScreen>
          <ErrorRecovery />
        </ThemeProvider>
      </body>
    </html>
  );
}
