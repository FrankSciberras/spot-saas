'use client';

import { useEffect, useState } from 'react';

const REFRESH_KEY = 'error_page_refresh';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState(3);
  const [hasRefreshed, setHasRefreshed] = useState(false);

  useEffect(() => {
    // Check if this looks like a gateway error
    const isGatewayError = 
      error.message?.includes('502') ||
      error.message?.includes('503') ||
      error.message?.includes('504') ||
      error.message?.includes('Bad Gateway') ||
      error.message?.includes('fetch');

    // Check if we already tried refreshing
    const lastAttempt = sessionStorage.getItem(REFRESH_KEY);
    const recentlyRefreshed = lastAttempt && (Date.now() - parseInt(lastAttempt, 10)) < 15000;

    if (isGatewayError && !recentlyRefreshed) {
      setHasRefreshed(false);
      sessionStorage.setItem(REFRESH_KEY, Date.now().toString());
      
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            window.location.reload();
            return 0;
          }
          return c - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setHasRefreshed(true);
    }
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'system-ui, sans-serif',
      background: '#f8fafc',
    }}>
      <div style={{
        maxWidth: '400px',
        textAlign: 'center',
        padding: '40px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
          {hasRefreshed ? '⚠️' : '🔄'}
        </div>
        <h1 style={{ 
          fontSize: '20px', 
          fontWeight: 600, 
          color: '#1e293b',
          marginBottom: '8px',
        }}>
          {hasRefreshed ? 'Something went wrong' : 'Connection issue'}
        </h1>
        <p style={{ 
          color: '#64748b', 
          marginBottom: '24px',
          fontSize: '14px',
          lineHeight: 1.5,
        }}>
          {hasRefreshed 
            ? 'We encountered an error loading this page.'
            : `Reconnecting in ${countdown} seconds...`
          }
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Refresh now
          </button>
          {hasRefreshed && (
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 20px',
                background: '#e2e8f0',
                color: '#475569',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
