import Link from 'next/link';
import type { PlanDef } from '@/lib/billing/plans';
import { START_TRIAL } from '../links';
import { Icon } from '../feature/icons';

/**
 * Homepage pricing: three plan cards, a VAT note with a link to the full
 * calculator on /pricing, and an Enterprise callout.
 *
 * Names, prices, included vehicles and links come from the live plan catalogue
 * (admin-editable), so the homepage can never quote a stale price. The short
 * card copy below is the homepage summary of each plan; a plan without an entry
 * falls back to its own blurb and feature list.
 */
const CARD_COPY: Record<string, { desc: string; points: string[]; detail: string }> = {
  starter: {
    desc: 'For the owner getting the basics in order.',
    points: ['Vehicles, drivers & shifts', 'Weekly rosters', 'Basic live GPS map'],
    detail: 'Service and damage logging',
  },
  growth: {
    desc: 'For fleets managing weekly driver pay.',
    points: ['Everything in Starter', 'Driver settlements & bookkeeping', 'Full GPS and document alerts'],
    detail: 'Priority support',
  },
  scale: {
    desc: 'For larger fleets that want a guided start.',
    points: ['Everything in Pro', 'Guided onboarding', 'Assisted data import'],
    detail: 'Additional vehicles available',
  },
};

export default function HomePricing({ plans }: { plans: PlanDef[] }) {
  const cards = plans.filter((p) => !p.isCustom);
  const custom = plans.find((p) => p.isCustom);
  // "More than 75 vehicles?" — the largest self-serve cap, from the catalogue.
  const selfServeCap = Math.max(0, ...cards.map((p) => p.maxVehicles ?? 0));

  return (
    <>
      <div className="hp-grid reveal-stagger">
        {cards.map((plan) => {
          const copy = CARD_COPY[plan.id] ?? {
            desc: plan.blurb ?? '',
            points: plan.features.slice(0, 3),
            detail: plan.features[3] ?? '',
          };
          return (
            <article key={plan.id} className={`hp-card${plan.isPopular ? ' featured' : ''}`}>
              <h3>{plan.name}</h3>
              <p className="hp-desc">{copy.desc}</p>
              <div className="hp-price"><strong>€{plan.priceAmount}</strong><span>/ month</span></div>
              {plan.includedVehicles != null && <p className="hp-included">{plan.includedVehicles} vehicles included</p>}
              <ul>
                {copy.points.map((pt) => (
                  <li key={pt}><Icon.check aria-hidden="true" />{pt}</li>
                ))}
              </ul>
              {copy.detail && <span className="hp-detail">{copy.detail}</span>}
              <Link href={plan.ctaHref ?? START_TRIAL} className={`btn btn-lg ${plan.isPopular ? 'btn-primary' : 'btn-ghost'}`}>
                Start free trial
              </Link>
            </article>
          );
        })}
      </div>

      <div className="hp-note">
        <span>Base monthly prices exclude VAT. Extra vehicles cost more.</span>
        <Link className="text-link" href="/pricing">Compare plans and calculate your price</Link>
      </div>

      {custom && (
        <div className="hp-enterprise">
          <div>
            <h3>{custom.name}</h3>
            <p>{selfServeCap > 0 ? `More than ${selfServeCap} vehicles? ` : ''}Let’s talk about your fleet.</p>
          </div>
          <a className="btn btn-ghost btn-lg" href={custom.ctaHref ?? '/contact'}>
            Contact our sales team
            <Icon.arrowRight aria-hidden="true" />
          </a>
        </div>
      )}
    </>
  );
}
