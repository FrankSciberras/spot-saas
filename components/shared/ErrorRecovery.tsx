'use client';

import { useEffect } from 'react';

const REFRESH_KEY = 'error_refresh_attempted';
const REFRESH_EXPIRY = 10000; // 10 seconds

/**
 * Monitors for gateway errors and attempts one auto-refresh.
 * Uses sessionStorage to prevent infinite refresh loops.
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

    // Listen for fetch errors (catches API 502s)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          handleGatewayError();
        }
        return response;
      } catch (error) {
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const handleGatewayError = () => {
    const lastAttempt = sessionStorage.getItem(REFRESH_KEY);
    
    // Only refresh if we haven't tried recently
    if (!lastAttempt) {
      sessionStorage.setItem(REFRESH_KEY, Date.now().toString());
      window.location.reload();
    }
  };

  return null;
}
