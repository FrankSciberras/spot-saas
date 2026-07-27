/**
 * Single source of truth for which URLs belong to the signed-in app rather than
 * the public marketing site.
 *
 * Three places need to agree on this and used to each keep their own copy:
 *   - proxy.ts          — which requests must be authenticated
 *   - SplashScreen.tsx  — which routes get the boot splash
 *   - app/robots.ts     — which routes crawlers should not follow
 *
 * When they drifted, a marketing page ended up treated as app UI: its content
 * was server-rendered inside `visibility:hidden` behind a loading spinner, so
 * every landing page painted blank until a health check came back.
 *
 * ⚠️ ADD ANY NEW PRIVATE SECTION HERE.
 */
export const APP_ROUTE_PREFIXES = [
  '/fleet',
  '/driver',
  '/admin',
  '/staff',
  '/dashboard',
  '/billing',
  '/onboarding',
] as const;

/** True when the path belongs to the authenticated app. */
export function isAppRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return APP_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
