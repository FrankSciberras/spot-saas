'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { rovoraFontVars } from '@/lib/rovoraFonts';

/**
 * 404 page, styled with the Rovora design system (.rovora-site tokens + button
 * classes from app/rovora-site.css). Theme follows the visitor's OS preference.
 */
export default function NotFound() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setTheme(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme={theme}>
      <div style={st.wrap}>
        <div style={st.card}>
          <a className="logo" href="/" style={{ justifyContent: 'center', marginBottom: 26 }}>
            <img src="/logo-full.png" alt="Rovora" />
          </a>

          <div style={st.code} className="mono">
            404
          </div>
          <h1 style={st.title}>Page not found</h1>
          <p style={st.sub}>
            The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved. Check the address, or head back.
          </p>

          <div style={st.actions}>
            <Link className="btn btn-primary" href="/">
              Back home
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => window.history.back()}>
              Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    maxWidth: 440,
    textAlign: 'center',
    padding: '44px 36px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 18,
    boxShadow: 'var(--shot-shadow)',
  },
  code: {
    fontSize: 'clamp(64px, 14vw, 92px)',
    fontWeight: 600,
    lineHeight: 1,
    letterSpacing: '-0.04em',
    color: 'var(--accent)',
  },
  title: { margin: '14px 0 0', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)' },
  sub: { margin: '12px auto 0', maxWidth: '36ch', fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-2)' },
  actions: { marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
};
