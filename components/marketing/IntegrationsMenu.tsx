'use client';

import Link from 'next/link';
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_COUNT,
  REQUEST_INTEGRATION_MAILTO,
} from '@/lib/integrations/catalog';
import IntegrationMark, { integrationTileStyle } from '@/components/shared/IntegrationMark';
import { brandName } from './IntegrationsMarquee';
import { useHoverMenu } from './useHoverMenu';

/** Which categories share a column, left to right. GPS gets the wide one. */
const COLUMNS: string[][] = [['gps'], ['ride-hail', 'accounting'], ['developers', 'accounts']];

const byKey = (key: string) => INTEGRATION_CATEGORIES.find((c) => c.key === key);

/** Shorter menu labels where the catalog name is a description. */
const SHORT: Record<string, string> = {
  'CSV download': 'CSV',
  'Rovora API': 'REST API',
  'Email notifications': 'Email',
};

/**
 * The "Integrations" nav item: a sheet of logos, grouped the way the
 * /integrations page is, so you can see at a glance what Rovora plugs into.
 * Deliberately a grid of tiles rather than the Features menu's long list.
 * Everything comes from lib/integrations/catalog, so it can't drift.
 */
export default function IntegrationsMenu() {
  const { open, wrapRef, close, toggle, wrapProps } = useHoverMenu();

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
              {COLUMNS.map((keys) => (
                <div className="im-col" key={keys.join('+')}>
                  {keys.map((key) => {
                    const cat = byKey(key);
                    if (!cat) return null;
                    return (
                      <div className="im-group" key={key}>
                        <div className="mm-heading">{cat.title}</div>
                        <div className={`im-tiles${key === 'gps' ? ' im-tiles-wide' : ''}`}>
                          {cat.items.map((it) => (
                            <Link
                              key={it.name}
                              href={`/integrations#${cat.key}`}
                              className="im-card"
                              role="menuitem"
                              onClick={close}
                            >
                              <span className="im-logo" style={integrationTileStyle(it, 40)} aria-hidden>
                                <IntegrationMark it={it} tile={40} />
                              </span>
                              <span className="im-name">{SHORT[it.name] ?? brandName(it.name)}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mm-strip">
              <span className="im-live"><i aria-hidden /> {INTEGRATION_COUNT} connections, all live today</span>
              <a className="im-request" href={REQUEST_INTEGRATION_MAILTO} onClick={close}>Need another one? Tell us</a>
              <Link className="mm-foot" href="/integrations" onClick={close}>
                See every integration
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
