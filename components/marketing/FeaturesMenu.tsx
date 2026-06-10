'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FEATURES, featureHref } from './links';
import { Icon, type IconName } from './feature/icons';

/** Which icon represents each feature page in the menu. */
const ICONS: Record<string, IconName> = {
  settlements: 'coins',
  'flexible-pay': 'sliders',
  adjustments: 'plusCircle',
  'live-tracking': 'pulse',
  rosters: 'calendar',
  maintenance: 'wrench',
};

/** Two columns: money/pay features vs day-to-day operations. */
const GROUPS: { heading: string; slugs: string[] }[] = [
  { heading: 'Money & pay', slugs: ['settlements', 'flexible-pay', 'adjustments'] },
  { heading: 'Operations', slugs: ['live-tracking', 'rosters', 'maintenance'] },
];

const bySlug = (slug: string) => FEATURES.find((f) => f.slug === slug)!;

/**
 * The "Features" nav item rendered as a hover/click megamenu listing every
 * feature page. Opens on hover (desktop) or click (touch/keyboard), closes on
 * Escape, outside click, or selecting a link.
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
          <div className="mm-grid">
            {GROUPS.map((group) => (
              <div className="mm-col" key={group.heading}>
                <div className="mm-heading">{group.heading}</div>
                {group.slugs.map((slug) => {
                  const f = bySlug(slug);
                  const I = Icon[ICONS[slug]];
                  return (
                    <Link
                      key={slug}
                      href={featureHref(slug)}
                      className="mm-item"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                    >
                      <span className="mm-ico"><I /></span>
                      <span className="mm-text">
                        <span className="mm-title">{f.label}</span>
                        <span className="mm-blurb">{f.blurb}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
          <a className="mm-foot" href={sectionHref} onClick={() => setOpen(false)}>
            See all features on one page
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </div>
      )}
    </div>
  );
}
