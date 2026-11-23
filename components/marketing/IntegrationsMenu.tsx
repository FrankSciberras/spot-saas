'use client';

import Link from 'next/link';
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_COUNT,
  REQUEST_INTEGRATION_MAILTO,
} from '@/lib/integrations/catalog';
import IntegrationMark, { integrationTileStyle } from '@/components/shared/IntegrationMark';
import { brandName } from './IntegrationsMarquee';
import { Icon } from './feature/icons';
import { useHoverMenu } from './useHoverMenu';

const byKey = (key: string) => INTEGRATION_CATEGORIES.find((c) => c.key === key);

/** One-line menu descriptions; the catalog's own descriptions are paragraphs. */
const SHORT: Record<string, string> = {
  Bolt: 'Trips and earnings sync directly',
  'Xero CSV export': 'CSV export',
  'QuickBooks CSV export': 'CSV export',
  'CSV download': 'Any spreadsheet',
  'Rovora API': 'Build your own connection',
};

/** Where each list item leads: its feature or docs page when it has one. */
const itemHref = (catKey: string, more?: string) => more ?? `/integrations#${catKey}`;

/** Ride-hailing, accounting and developer columns, in that order. */
const LIST_COLUMNS = ['ride-hail', 'accounting', 'developers'];

/**
 * The "Integrations" nav item: GPS trackers as a row of chips, then
 * ride-hailing, accounting and developer connections, and a side card with the
 * live count. Everything comes from lib/integrations/catalog, so it can't drift.
 */
export default function IntegrationsMenu({ sectionHref }: { sectionHref: string }) {
  const { open, wrapRef, close, toggle, wrapProps } = useHoverMenu();
  const gps = byKey('gps');

  return (
    <div className="mm" ref={wrapRef} {...wrapProps}>
      <button
        type="button"
        className={`mm-trigger${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={toggle}
      >
        Integrations
        <svg className="mm-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mm-panel" role="menu">
          <div className="container mm-inner">
            <div className="im-grid">
              {gps && (
                <div className="im-col">
                  <div className="mm-heading">{gps.title}</div>
                  <div className="im-chips">
                    {gps.items.map((it) => (
                      <Link key={it.name} href="/integrations#gps" className="im-chip" role="menuitem" onClick={close}>
                        <span className="im-logo" style={integrationTileStyle(it, 22)} aria-hidden>
                          <IntegrationMark it={it} tile={22} />
                        </span>
                        {brandName(it.name)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {LIST_COLUMNS.map((key) => {
                const cat = byKey(key);
                if (!cat) return null;
                return (
                  <div className="im-col" key={key}>
                    <div className="mm-heading">{key === 'ride-hail' ? 'Ride-hailing' : cat.title}</div>
                    {cat.items.map((it) => (
                      <Link key={it.name} href={itemHref(cat.key, it.more)} className="im-item" role="menuitem" onClick={close}>
                        <span className="im-logo" style={integrationTileStyle(it, 32)} aria-hidden>
                          <IntegrationMark it={it} tile={32} />
                        </span>
                        <span className="mm-text">
                          <span className="mm-title">{brandName(it.name)}</span>
                          <span className="mm-blurb">{SHORT[it.name] ?? it.desc}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              })}

              <div className="mm-rail">
                <Link className="mm-card mm-card-link" href="/integrations" role="menuitem" onClick={close}>
                  <span className="mm-card-k">Live today</span>
                  <strong>{INTEGRATION_COUNT} connections</strong>
                  <span className="mm-card-more">
                    See all integrations
                    <Icon.arrowRight aria-hidden="true" />
                  </span>
                </Link>
                <a className="mm-mini" href={sectionHref} role="menuitem" onClick={close}>How it connects</a>
                <a className="mm-mini" href={REQUEST_INTEGRATION_MAILTO} role="menuitem" onClick={close}>Request an integration</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
