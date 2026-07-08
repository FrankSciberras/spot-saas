'use client';

import { useEffect, useState } from 'react';
import { rovoraFontVars } from '@/lib/rovoraFonts';

const REFRESH_KEY = 'error_page_refresh';

/**
 * Root error boundary. Restyled to the Rovora design system (.rovora-site tokens
 * + button classes from app/rovora-site.css, which is imported globally).
 *
 * Behaviour is unchanged: gateway-style errors (502/503/504/fetch) auto-refresh
 * once after a short countdown; everything else shows a manual recovery card.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState(3);
  const [hasRefreshed, setHasRefreshed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Match the visitor's OS colour scheme so the card never feels out of place.
  useEffect(() => {
    setTheme(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const isGatewayError =
      error.message?.includes('502') ||
      error.message?.includes('503') ||
      error.message?.includes('504') ||
      error.message?.includes('Bad Gateway') ||
      error.message?.includes('fetch');

    const lastAttempt = sessionStorage.getItem(REFRESH_KEY);
    const recentlyRefreshed = lastAttempt && Date.now() - parseInt(lastAttempt, 10) < 15000;

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

  const reconnecting = !hasRefreshed;

  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme={theme}>
      <style>{SPIN_CSS}</style>
      <div style={st.wrap}>
        <div style={st.card}>
          <a className="logo" href="/" style={{ justifyContent: 'center', marginBottom: 22 }}>
            <img src="/logo-full.png" alt="Rovora" />
          </a>

          <div
            style={{
              ...st.badge,
              background: reconnecting ? 'var(--accent-soft)' : 'var(--warn-soft)',
              color: reconnecting ? 'var(--accent)' : 'var(--warn)',
              borderColor: reconnecting ? 'var(--accent-line)' : 'var(--warn-soft)',
            }}
          >
            {reconnecting ? (
              <svg className="rovora-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 4v5h-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.3 3.8 2.6 17a1.5 1.5 0 0 0 1.3 2.3h16.2a1.5 1.5 0 0 0 1.3-2.3L13.7 3.8a1.6 1.6 0 0 0-2.8 0Z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            )}
          </div>

          <h1 style={st.title}>{reconnecting ? 'Reconnecting…' : 'Something went wrong'}</h1>
          <p style={st.sub}>
            {reconnecting
              ? `The server didn't respond. Trying again in ${countdown}s.`
              : 'We hit an unexpected error loading this page. You can try again or refresh.'}
          </p>

          {error.digest && !reconnecting && (
            <p style={st.digest} className="mono">
              Ref: {error.digest}
            </p>
          )}

          <div style={st.actions}>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Refresh now
            </button>
            {!reconnecting && (
              <button type="button" className="btn btn-ghost" onClick={() => reset()}>
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const SPIN_CSS = `
.rovora-spin { animation: rovoraSpin 0.9s linear infinite; }
@keyframes rovoraSpin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .rovora-spin { animation: none; } }
`;

const st: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'var(--bg-0)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    textAlign: 'center',
    padding: '40px 36px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 18,
    boxShadow: 'var(--shot-shadow)',
  },
  badge: {
    width: 56,
    height: 56,
    margin: '0 auto 20px',
    borderRadius: 16,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid transparent',
  },
  title: { margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)' },
  sub: { margin: '10px auto 0', maxWidth: '32ch', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-2)' },
  digest: { margin: '14px 0 0', fontSize: 12, color: 'var(--text-4)' },
  actions: { marginTop: 26, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
};
