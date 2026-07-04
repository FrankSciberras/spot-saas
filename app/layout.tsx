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
  title: 'Rovora Fleet Management',
  description: 'Rovora is your true company overview of what happens on the road — drivers, vehicles, shifts, settlements and more, in one dashboard.',
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
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          /* Inline critical splash styles to prevent FOUC — minimal, gradient-free.
             Mirrors components/shared/SplashScreen.module.css. */
          body { margin: 0; background: #0a0c11; }
          .splash-fallback {
            position: fixed; inset: 0; z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            background: #0a0c11;
          }
          .splash-fallback::after {
            content: ''; width: 184px; height: 3px; border-radius: 999px;
            background:
              linear-gradient(90deg, transparent 0 30%, #2bbd7e 30% 70%, transparent 70% 100%)
              rgba(255,255,255,0.08);
            background-size: 240% 100%;
            animation: splashSweep 1.25s ease-in-out infinite;
          }
          @keyframes splashSweep { 0% { background-position: 130% 0; } 100% { background-position: -130% 0; } }
          @media (prefers-reduced-motion: reduce) { .splash-fallback::after { animation: none; } }
        `}} />
      </head>
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
