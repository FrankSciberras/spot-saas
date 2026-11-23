'use client';

import { useState, type ReactNode } from 'react';

/**
 * "Built to work with the tools you already run." — the partner logo strip
 * under the hero, with a Pause control so the moving logos can be stopped
 * (WCAG 2.2.2). On phones the strip stands still as a grid instead.
 */
export default function LogoStrip({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  return (
    <section className="home-logos" aria-labelledby="home-logos-title">
      <div className="container">
        <div className="home-logos-head">
          <h2 id="home-logos-title">Built to work with the tools you already run.</h2>
          <button
            type="button"
            className="home-logos-pause"
            aria-pressed={paused}
            aria-label={paused ? 'Play integration logo animation' : 'Pause integration logo animation'}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            )}
            <span>{paused ? 'Play' : 'Pause'}</span>
          </button>
        </div>
        <div className="home-logos-track" data-paused={paused || undefined}>{children}</div>
      </div>
    </section>
  );
}
