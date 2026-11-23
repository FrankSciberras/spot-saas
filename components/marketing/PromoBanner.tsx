import Link from 'next/link';
import { promoHeadline, type TrialCopy } from '@/lib/billing/trial-offer';
import { START_TRIAL } from './links';

/**
 * Thin announcement bar across the very top of every marketing page, above the
 * nav, shown only while an admin-set trial campaign is running (/admin → Trials),
 * e.g. "AUTUMN OFFER  3 months free instead of 30 days — sign up by 31 October".
 * Renders nothing the rest of the time.
 *
 * It replaced the badge that used to sit inside each page hero: one place for
 * the offer, on every page, without pushing the headline down.
 */
export default function PromoBanner({ trial }: { trial: TrialCopy }) {
  const promo = promoHeadline(trial);
  if (!promo) return null;
  return (
    <div className="promo-bar" role="region" aria-label="Current offer">
      <Link className="promo-bar-inner" href={START_TRIAL} data-track="Promo banner click" data-track-label={promo.tag}>
        <span className="promo-bar-tag">{promo.tag}</span>
        <span className="promo-bar-text">{promo.text}</span>
        <span className="promo-bar-cta">
          Get started free
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </Link>
    </div>
  );
}
