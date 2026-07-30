'use client';

import { useEffect } from 'react';

const REFRESH_KEY = 'error_refresh_attempted';
const REFRESH_EXPIRY = 10000; // 10 seconds

/**
 * Monitors for gateway errors and attempts one auto-refresh.
 * Uses sessionStorage to prevent infinite refresh loops.
 *
 * SCOPE: only app-shell requests (Next.js chunks / RSC payloads) trigger the
 * reload. A 502/503/504 on those means the container restarted under us and the
 * page really is broken, so reloading is the fix.
 *
 * `/api/*` calls are deliberately EXCLUDED. Reloading on those threw away
 * whatever the visitor had on screen — most visibly the support chat, which
 * would vanish mid-conversation instead of showing its "Talk to a real person"
 * fallback. Callers of our own API routes handle their own failures.
 */
export default function ErrorRecovery() {
  useEffect(() => {
    // Check if we should clear the refresh flag (after expiry)
    const lastAttempt = sessionStorage.getItem(REFRESH_KEY);
    if (lastAttempt) {
      const elapsed = Date.now() - parseInt(lastAttempt, 10);
      if (elapsed > REFRESH_EXPIRY) {
        sessionStorage.removeItem(REFRESH_KEY);
      }
    }

    const handleGatewayError = () => {
      // Only refresh if we haven't tried recently
      if (!sessionStorage.getItem(REFRESH_KEY)) {
        sessionStorage.setItem(REFRESH_KEY, Date.now().toString());
        window.location.reload();
      }
    };

    // Resolve whatever fetch() was called with down to a pathname we can test.
    const pathOf = (input: RequestInfo | URL): string => {
      try {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        return new URL(url, window.location.origin).pathname;
      } catch {
        return '';
      }
    };

    // Listen for gateway errors on app-shell requests (catches post-deploy 502s)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const isGatewayError =
        response.status === 502 || response.status === 503 || response.status === 504;
      if (isGatewayError && !pathOf(args[0]).startsWith('/api/')) {
        handleGatewayError();
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
