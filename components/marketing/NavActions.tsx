'use client';

import Link from 'next/link';
import { SIGN_IN, START_TRIAL } from './links';
import { useNavViewer } from './useNavViewer';

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
  const viewer = useNavViewer();

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
