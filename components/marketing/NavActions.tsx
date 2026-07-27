'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SIGN_IN, START_TRIAL } from './links';
import type { NavViewer } from '@/lib/auth/viewer';

/**
 * The signed-in/signed-out half of the marketing nav.
 *
 * Deliberately client-side: resolving the viewer on the server read cookies and
 * forced every marketing page to render dynamically, so nothing could be cached
 * at the edge. Rendering the signed-out state first and swapping in the avatar
 * after a fetch keeps the pages static — and the signed-out markup is exactly
 * what we want crawlers to index anyway.
 */
export default function NavActions() {
  const [viewer, setViewer] = useState<NavViewer | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/nav-viewer', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setViewer(data?.viewer ?? null))
      // Signed-out is the correct fallback for any failure here.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (viewer) {
    return (
      <Link
        className="nav-avatar"
        href={viewer.dashboardHref}
        title="Go to your dashboard"
        aria-label={`Go to your dashboard${viewer.name ? ` — ${viewer.name}` : ''}`}
      >
        <span aria-hidden>{viewer.initials}</span>
      </Link>
    );
  }

  return (
    <>
      <Link className="signin" href={SIGN_IN}>Sign in</Link>
      <Link className="btn btn-primary" href={START_TRIAL}>Start free trial</Link>
    </>
  );
}
