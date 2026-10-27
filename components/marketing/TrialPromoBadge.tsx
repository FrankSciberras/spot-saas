import { promoHeadline, type TrialCopy } from '@/lib/billing/trial-offer';

/**
 * Hero announcement shown only while an admin-set trial campaign is running
 * (/admin → Trials), e.g. "AUTUMN OFFER  3 months free instead of 30 days —
 * sign up by 31 October". Renders nothing the rest of the time.
 */
export default function TrialPromoBadge({ trial }: { trial: TrialCopy }) {
  const promo = promoHeadline(trial);
  if (!promo) return null;
  return (
    <div className="trial-promo-row">
      <span className="trial-promo">
        <span className="trial-promo-tag">{promo.tag}</span>
        {promo.text}
      </span>
    </div>
  );
}
