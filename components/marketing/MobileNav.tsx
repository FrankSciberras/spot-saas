'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FEATURES, featureHref, SIGN_IN, START_TRIAL } from './links';
import { FEATURE_ICONS } from './FeaturesMenu';
import { Icon } from './feature/icons';
import RovoraThemeToggle from './RovoraThemeToggle';
import { useNavViewer } from './useNavViewer';

/**
 * The phone/tablet nav. Below 880px the desktop links are hidden, so this burger
 * is the only way into the site — including when you're signed in, where the nav
 * previously showed nothing but an avatar.
 *
 * The sheet also owns the light/dark switch: it's kept out of the top bar so the
 * header stays down to a logo and one control.
 */
export default function MobileNav({ onHome = false }: { onHome?: boolean }) {
  const [open, setOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const viewer = useNavViewer();
  const h = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);

  // Hold the page still behind the sheet, and close on Escape. The body class
  // also parks the support-chat bubble, which otherwise floats over the menu.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('mnav-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.body.classList.remove('mnav-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className={`nav-burger${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div className="mnav" id="mobile-menu">
          <nav className="mnav-inner">
            <button
              type="button"
              className={`mnav-acc${featuresOpen ? ' open' : ''}`}
              aria-expanded={featuresOpen}
              onClick={() => setFeaturesOpen((o) => !o)}
            >
              Features
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {featuresOpen && (
              <div className="mnav-sub">
                {FEATURES.map((f) => {
                  const I = Icon[FEATURE_ICONS[f.slug]];
                  return (
                    <Link key={f.slug} className="mnav-sub-link" href={featureHref(f.slug)} onClick={close}>
                      <span className="mnav-ico"><I /></span>
                      {f.label}
                    </Link>
                  );
                })}
                <a className="mnav-all" href={h('features')} onClick={close}>
                  See all features on one page
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </a>
              </div>
            )}

            <Link className="mnav-link" href="/integrations" onClick={close}>Integrations</Link>
            <Link className="mnav-link" href="/ai" onClick={close}>
              Rovora AI
              <span className="mm-soon">Soon</span>
            </Link>
            <Link className="mnav-link" href="/pricing" onClick={close}>Pricing</Link>
            <a className="mnav-link" href={h('faq')} onClick={close}>FAQ</a>
            <Link className="mnav-link" href="/blog" onClick={close}>Blog</Link>
            <Link className="mnav-link" href="/changelog" onClick={close}>What&rsquo;s new</Link>
            <Link className="mnav-link" href="/contact" onClick={close}>Contact us</Link>

            <div className="mnav-cta">
              {viewer ? (
                <Link className="btn btn-primary btn-lg" href={viewer.dashboardHref} onClick={close}>
                  Go to your dashboard
                </Link>
              ) : (
                <>
                  <Link className="btn btn-primary btn-lg" href={START_TRIAL} onClick={close}>Start free trial</Link>
                  <Link className="btn btn-ghost btn-lg" href={SIGN_IN} onClick={close}>Sign in</Link>
                </>
              )}
            </div>

            <div className="mnav-theme">
              <span>Appearance</span>
              <RovoraThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
