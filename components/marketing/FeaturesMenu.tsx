'use client';

import Link from 'next/link';
import { FEATURE_MENU, AUDIENCES, featureHref, audienceHref } from './links';
import { Icon } from './feature/icons';
import { FEATURE_ICONS } from './feature-icons';
import { useHoverMenu } from './useHoverMenu';

export { FEATURE_ICONS };

/**
 * The "Features" nav item rendered as a full-width sheet that drops straight out
 * of the header's bottom border: Fleet / Drivers / Money & admin, then who it's
 * for and a shortcut to the toolkit on the homepage. Opens on hover (desktop) or
 * click (touch/keyboard), closes on Escape, outside click, or selecting a link.
 */
export default function FeaturesMenu({ sectionHref }: { sectionHref: string }) {
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
        Features
        <svg className="mm-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mm-panel" role="menu">
          <div className="container mm-inner">
            <div className="mm-grid">
              {FEATURE_MENU.map((group) => (
                <div className="mm-col" key={group.heading}>
                  <div className="mm-heading">{group.heading}</div>
                  {group.items.map((item) => {
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
                          <span className="mm-title">{item.label}</span>
                          <span className="mm-blurb">{item.blurb}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}

              <div className="mm-rail">
                <div className="mm-heading">Who it&rsquo;s for</div>
                {AUDIENCES.map((a) => (
                  <Link key={a.slug} href={audienceHref(a.slug)} className="mm-mini" role="menuitem" onClick={close}>
                    <Icon.users />
                    {a.label}
                  </Link>
                ))}

                <a className="mm-card mm-card-link" href={sectionHref} role="menuitem" onClick={close}>
                  <span className="mm-card-k">See it on this page</span>
                  <strong>The Everyday Toolkit</strong>
                  <span className="mm-card-more">
                    Screens from the demo account
                    <Icon.arrowRight aria-hidden="true" />
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
