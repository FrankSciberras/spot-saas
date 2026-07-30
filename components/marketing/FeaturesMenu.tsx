'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { FEATURES, featureHref } from './links';
import { Icon, type IconName } from './feature/icons';

/** Which icon represents each feature page — shared with the mobile menu. */
export const FEATURE_ICONS: Record<string, IconName> = {
  vehicles: 'car',
  maintenance: 'wrench',
  damage: 'camera',
  'live-tracking': 'pulse',
  rosters: 'calendar',
  settlements: 'coins',
  'flexible-pay': 'sliders',
  adjustments: 'plusCircle',
};

/** A feature page in the sheet: its slug plus the things it actually covers. */
interface MenuItem {
  slug: string;
  /** Short capability tags shown under the blurb — the "what's inside" detail. */
  tags: string[];
}

/** Three columns of feature pages, grouped by which part of the job they do. */
const GROUPS: { heading: string; items: MenuItem[] }[] = [
  {
    heading: 'Run your fleet',
    items: [
      { slug: 'vehicles', tags: ['Documents & expiry', 'Live kilometres', 'Utilisation'] },
      { slug: 'maintenance', tags: ['Service due by km & date', 'Costs', 'Full history'] },
      { slug: 'damage', tags: ['Photo reports', 'Repair status', 'Cost per car'] },
    ],
  },
  {
    heading: 'Drivers & shifts',
    items: [
      { slug: 'live-tracking', tags: ['Live map', 'Trips & stops', 'Safety scores'] },
      { slug: 'rosters', tags: ['Weekly planner', 'Vehicle assignment', 'Shift log'] },
    ],
  },
  {
    heading: 'Driver pay',
    items: [
      { slug: 'settlements', tags: ['Auto reconciliation', 'PDF statements', 'Approvals'] },
      { slug: 'flexible-pay', tags: ['Pay presets', 'Hourly & fixed wage', 'Rent & tax'] },
      { slug: 'adjustments', tags: ['One-off & recurring', 'Deductions', 'Applied automatically'] },
    ],
  },
];

/** A sparkle mark for the Rovora AI link — matches the one in the top nav. */
const Sparkle = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
);

/** Right-hand rail: the rest of the platform — pages that aren't feature pages. */
const PLATFORM: { href: string; label: string; icon: ComponentType; soon?: boolean }[] = [
  { href: '/ai', label: 'Rovora AI', icon: Sparkle, soon: true },
  { href: '/integrations', label: 'Integrations & exports', icon: Icon.repeat },
  { href: '/security', label: 'Security & your data', icon: Icon.shield },
  { href: '/pricing', label: 'Plans & pricing', icon: Icon.percent },
];

/** Shipped with every plan, but without a marketing page of their own. */
const INCLUDED = [
  'Parts & inventory',
  'Bookkeeping & reports',
  'Reminders & renewals',
  'Roles & permissions',
  'Audit log',
  'QuickBooks & Xero exports',
  'Switch modules on or off',
];

const bySlug = (slug: string) => FEATURES.find((f) => f.slug === slug)!;

/**
 * The "Features" nav item rendered as a full-width sheet that drops straight out
 * of the header's bottom border. Opens on hover (desktop) or click (touch/
 * keyboard), closes on Escape, outside click, or selecting a link.
 */
export default function FeaturesMenu({ sectionHref }: { sectionHref: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const close = () => setOpen(false);

  return (
    <div
      className="mm"
      ref={wrapRef}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className={`mm-trigger${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        Features
        <svg className="mm-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mm-panel" role="menu">
          <div className="container mm-inner">
            <div className="mm-grid">
              {GROUPS.map((group) => (
                <div className="mm-col" key={group.heading}>
                  <div className="mm-heading">{group.heading}</div>
                  {group.items.map((item) => {
                    const f = bySlug(item.slug);
                    const I = Icon[FEATURE_ICONS[item.slug]];
                    return (
                      <Link
                        key={item.slug}
                        href={featureHref(item.slug)}
                        className="mm-item"
                        role="menuitem"
                        onClick={close}
                      >
                        <span className="mm-ico"><I /></span>
                        <span className="mm-text">
                          <span className="mm-title">{f.label}</span>
                          <span className="mm-blurb">{f.blurb}</span>
                          <span className="mm-tags">
                            {item.tags.map((t) => (
                              <span className="mm-tag" key={t}>{t}</span>
                            ))}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}

              <div className="mm-rail">
                <div className="mm-heading">More from Rovora</div>
                {PLATFORM.map((p) => {
                  const I = p.icon;
                  return (
                    <Link key={p.href} href={p.href} className="mm-mini" role="menuitem" onClick={close}>
                      <I />
                      {p.label}
                      {p.soon && <span className="mm-soon">Soon</span>}
                    </Link>
                  );
                })}

                <div className="mm-card">
                  <span className="mm-card-k">Free driver app</span>
                  <p>Drivers clock in, upload their documents and see their pay from their phone.</p>
                  <a
                    className="gplay-badge"
                    href="https://play.google.com/store/apps/details?id=eu.rovora.driver&hl=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Get Rovora Driver on Google Play"
                  >
                    <svg className="gplay-logo" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#00A0FF" d="M3 1.5 11.5 12 3 22.5Z" />
                      <path fill="#FF3B30" d="M3 1.5 21 10.3 11.5 12Z" />
                      <path fill="#00D267" d="M3 22.5 21 13.7 11.5 12Z" />
                      <path fill="#FFCE00" d="M21 10.3 21 13.7 11.5 12Z" />
                    </svg>
                    <span className="gplay-text">
                      <small>Get it on</small>
                      <strong>Google Play</strong>
                    </span>
                  </a>
                </div>
              </div>
            </div>

            <div className="mm-strip">
              <span className="mm-strip-label">Also included</span>
              <ul className="mm-chips">
                {INCLUDED.map((label) => (
                  <li className="mm-chip" key={label}>
                    <Icon.check />
                    {label}
                  </li>
                ))}
              </ul>
              <a className="mm-foot" href={sectionHref} onClick={close}>
                See all features on one page
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
