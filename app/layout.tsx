import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistration from '@/components/shared/ServiceWorkerRegistration';
import ErrorRecovery from '@/components/shared/ErrorRecovery';
import SplashScreen from '@/components/shared/SplashScreen';

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Spot Dashboard - Cab Fleet Management',
  description: 'Manage your taxi fleet with ease - drivers, vehicles, shifts, and more.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Spot',
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
  maximumScale: 1,
  userScalable: false,
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
          /* Inline critical splash screen styles to prevent FOUC */
          body { margin: 0; background: #0f172a; }
          .splash-fallback {
            position: fixed; inset: 0; z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
          }
          .splash-fallback::after {
            content: ''; width: 40px; height: 40px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: #60a5fa; border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}} />
      </head>
      <body className={figtree.className}>
        <ServiceWorkerRegistration />
        <SplashScreen>
          {children}
        </SplashScreen>
        <ErrorRecovery />
      </body>
    </html>
  );
}
