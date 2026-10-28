'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { installLifecycle, trackEvent, trackPageview } from '@/lib/analytics/client';
import { CONSENT_CHANGE_EVENT } from '@/lib/analytics/constants';
import { syncGoogleTag } from '@/lib/analytics/gtm';
import CookieBanner from './CookieBanner';

/**
 * Rovora's own website analytics — mounted once in the root layout.
 *
 * Counts a page view on every route change and reports real reading time and
 * scroll depth (see lib/analytics/client.ts). Clicks that matter for growth are
 * picked up automatically, so marketing pages need no extra markup:
 *
 *   "Get started free" links      → Start trial click   (label: where it was)
 *   "Sign in" links               → Sign in click
 *   /contact links                → Contact click / Book demo click
 *   mailto: / tel: links          → Email click / Phone click
 *   Play Store / App Store links  → App store click
 *   any other external link       → Outbound link       (label: destination)
 *   anything with data-track="…"  → that name (label: data-track-label)
 *
 * Nothing runs inside the signed-in app, in development, for bots, or in the
 * Rovora Driver app's WebView. Google Tag Manager rides along under the same
 * rules, but only once the visitor clicks "Allow" (see lib/analytics/gtm.ts).
 */
export default function SiteAnalytics() {
  const pathname = usePathname();

  useEffect(() => installLifecycle(), []);

  useEffect(() => {
    if (!pathname) return;
    trackPageview(pathname);
    syncGoogleTag(pathname);
  }, [pathname]);

  // Google Tag Manager loads the moment "Allow" is clicked, and steps back on "Decline".
  useEffect(() => {
    const onConsent = () => syncGoogleTag(window.location.pathname);
    window.addEventListener(CONSENT_CHANGE_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onConsent);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('a[href], [data-track]');
      if (!el) return;

      const section = el.closest('section[id]')?.id;
      const where = el.closest('[class*="mnav"]')
        ? 'Mobile menu'
        : el.closest('nav, header')
          ? 'Nav'
          : el.closest('footer')
            ? 'Footer'
            : window.location.pathname + (section ? `#${section}` : '');

      const named = el.getAttribute('data-track');
      if (named) {
        trackEvent(named, { label: el.getAttribute('data-track-label') || where });
        return;
      }

      const a = el as HTMLAnchorElement;
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('mailto:')) {
        trackEvent('Email click', { label: href.slice(7).split('?')[0].slice(0, 120) });
        return;
      }
      if (href.startsWith('tel:')) {
        trackEvent('Phone click', { label: where });
        return;
      }

      let url: URL;
      try {
        url = new URL(a.href);
      } catch {
        return;
      }
      if (url.host === window.location.host) {
        if (url.pathname === '/login') {
          trackEvent(url.searchParams.get('mode') === 'signup' ? 'Start trial click' : 'Sign in click', { label: where });
        } else if (url.pathname === '/contact') {
          trackEvent(/demo/i.test(a.textContent ?? '') ? 'Book demo click' : 'Contact click', { label: where });
        }
        return;
      }
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const store = /(^|\.)play\.google\.com$|(^|\.)apps\.apple\.com$/.test(url.host);
        trackEvent(store ? 'App store click' : 'Outbound link', {
          label: store ? url.host : (url.host.replace(/^www\./, '') + url.pathname).slice(0, 120),
        });
      }
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return <CookieBanner />;
}
