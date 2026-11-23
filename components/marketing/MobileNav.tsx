'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FEATURE_MENU, AUDIENCES, featureHref, audienceHref, SIGN_IN, START_TRIAL } from './links';
import { INTEGRATION_CATEGORIES } from '@/lib/integrations/catalog';
import { brandName } from './IntegrationsMarquee';
import RovoraThemeToggle from './RovoraThemeToggle';
import { useNavViewer } from './useNavViewer';

const Caret = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const cat = (key: string) => INTEGRATION_CATEGORIES.find((c) => c.key === key);

/**
 * The phone/tablet nav. Below 880px the desktop links are hidden, so this burger
 * is the only way into the site — including when you're signed in.
 *
 * Order: the trial button, Rovora AI, then Features and Integrations as
 * expandable groups, Pricing, Request a demo and Sign in. The sheet also owns
 * the light/dark switch: it's kept out of the top bar so the header stays
 * down to a logo, one button and the burger.
 */
export default function MobileNav({ onHome = false }: { onHome?: boolean }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<'features' | 'integrations' | null>(null);
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
  const flip = (g: 'features' | 'integrations') => setGroup((cur) => (cur === g ? null : g));
  const gps = cat('gps');
  const lists = ['ride-hail', 'accounting', 'developers'].map(cat);

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
          <nav className="mnav-inner" aria-label="Mobile navigation">
            <div className="mnav-cta">
              {viewer ? (
                <Link className="btn btn-primary btn-lg" href={viewer.dashboardHref} onClick={close}>
                  Go to your dashboard
                </Link>
              ) : (
                <Link className="btn btn-primary btn-lg" href={START_TRIAL} onClick={close}>Start free trial</Link>
              )}
            </div>

            <Link className="mnav-ai" href="/ai" onClick={close}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              </svg>
              <span><strong>Rovora AI</strong><small>AI built into the whole system</small></span>
            </Link>

            <button
              type="button"
              className={`mnav-acc${group === 'features' ? ' open' : ''}`}
              aria-expanded={group === 'features'}
              aria-controls="mnav-features"
              onClick={() => flip('features')}
            >
              Features
              <Caret />
            </button>
            {group === 'features' && (
              <div className="mnav-sub" id="mnav-features">
                {FEATURE_MENU.map((g) => (
                  <div key={g.heading} className="mnav-group">
                    <span className="mnav-heading">{g.heading}</span>
                    {g.items.map((it) => (
                      <Link key={it.slug} className="mnav-sub-link" href={featureHref(it.slug)} onClick={close}>{it.label}</Link>
                    ))}
                  </div>
                ))}
                <div className="mnav-group">
                  <span className="mnav-heading">Who it&rsquo;s for</span>
                  {AUDIENCES.map((a) => (
                    <Link key={a.slug} className="mnav-sub-link" href={audienceHref(a.slug)} onClick={close}>{a.label}</Link>
                  ))}
                </div>
                <a className="mnav-all" href={h('features')} onClick={close}>See the Everyday Toolkit</a>
              </div>
            )}

            <button
              type="button"
              className={`mnav-acc${group === 'integrations' ? ' open' : ''}`}
              aria-expanded={group === 'integrations'}
              aria-controls="mnav-integrations"
              onClick={() => flip('integrations')}
            >
              Integrations
              <Caret />
            </button>
            {group === 'integrations' && (
              <div className="mnav-sub" id="mnav-integrations">
                {gps && (
                  <div className="mnav-group">
                    <span className="mnav-heading">{gps.title}</span>
                    <Link className="mnav-sub-link" href="/integrations#gps" onClick={close}>
                      {gps.items.map((it) => brandName(it.name)).join(', ')}
                    </Link>
                  </div>
                )}
                {lists.map((c) => c && (
                  <div key={c.key} className="mnav-group">
                    <span className="mnav-heading">{c.key === 'ride-hail' ? 'Ride-hailing' : c.title}</span>
                    {c.items.map((it) => (
                      <Link key={it.name} className="mnav-sub-link" href={it.more ?? `/integrations#${c.key}`} onClick={close}>{brandName(it.name)}</Link>
                    ))}
                  </div>
                ))}
                <Link className="mnav-all" href="/integrations" onClick={close}>All integrations</Link>
              </div>
            )}

            <Link className="mnav-link" href="/pricing" onClick={close}>Pricing</Link>
            <Link className="mnav-link" href="/contact?topic=demo#form" onClick={close}>Request a demo</Link>
            {!viewer && <Link className="mnav-link" href={SIGN_IN} onClick={close}>Sign in</Link>}

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
