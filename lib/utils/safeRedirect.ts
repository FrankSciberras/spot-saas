// =============================================================================
// SAFE REDIRECT TARGETS
// =============================================================================
// /login?redirectTo=… and /auth/callback?next=… take a "where to go afterwards"
// parameter. Only same-origin PATHS are honoured. An absolute URL, a
// protocol-relative "//evil.example", a backslash variant or anything else
// falls back — otherwise a crafted link could sign someone in and bounce them
// straight to a look-alike phishing site.
// =============================================================================

/**
 * Return `raw` if it is a plain internal path ("/fleet/vehicles?x=1#y"),
 * otherwise `fallback`.
 */
export function safeInternalPath(raw: string | null | undefined, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value.startsWith('/')) return fallback;
  // "//host", "/\host" and control characters are the classic escape hatches.
  if (value.startsWith('//') || value.startsWith('/\\') || /[\r\n\0]/.test(value)) return fallback;
  try {
    // Resolve against a throwaway origin: if the result's origin changed, the
    // value smuggled a host in (e.g. "/\evil.example" normalises to "//evil.example").
    const url = new URL(value, 'http://rovora.invalid');
    if (url.origin !== 'http://rovora.invalid') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
