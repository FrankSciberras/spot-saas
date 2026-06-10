import { getSession } from './session';
import { getPlatformAdmin } from './platform';

/**
 * The minimal identity the public marketing nav needs to swap "Sign in" for an
 * avatar that links straight to the logged-in user's dashboard.
 */
export interface NavViewer {
  /** Display name, if we have one. */
  name: string | null;
  email: string;
  /** 1–2 letter avatar initials. */
  initials: string;
  /** Where the avatar links — the user's home dashboard. */
  dashboardHref: string;
}

function initialsFrom(name: string | null, email: string): string {
  const source = (name ?? '').trim();
  if (source) {
    const parts = source.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }
  return (email.trim()[0] ?? '?').toUpperCase();
}

/**
 * Resolves the viewer for the marketing nav, or null if signed out.
 *
 * Dashboard routing mirrors the home page's tier logic:
 *   platform admin -> /admin   driver (only) -> /driver   everyone else -> /fleet
 */
export async function getNavViewer(): Promise<NavViewer | null> {
  const platformAdmin = await getPlatformAdmin();
  if (platformAdmin) {
    return {
      name: null,
      email: platformAdmin.email,
      initials: initialsFrom(null, platformAdmin.email),
      dashboardHref: '/admin',
    };
  }

  const session = await getSession();
  if (!session) return null;

  const dashboardHref =
    session.role === 'driver' && !session.also_staff ? '/driver' : '/fleet';

  return {
    name: session.full_name,
    email: session.email,
    initials: initialsFrom(session.full_name, session.email),
    dashboardHref,
  };
}
