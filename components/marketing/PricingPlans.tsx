'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PlanDef } from '@/lib/billing/plans';
import { monthlyPriceFor, planAllowsVehicles } from '@/lib/billing/plans';
import { START_TRIAL } from './links';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const MIN_V = 1;
const MAX_V = 60;

/**
 * Interactive pricing — an operator drags/steps the vehicle count and every
 * plan's monthly price updates live (base + per-vehicle add-on). The plan that
 * fits the chosen count for the lowest price is flagged "Best value".
 */
export default function PricingPlans({ plans }: { plans: PlanDef[] }) {
  const [vehicles, setVehicles] = useState(8);

  // Lowest-priced plan whose hard cap allows this many vehicles.
  const eligible = plans
    .filter((p) => !p.isCustom && planAllowsVehicles(p, vehicles))
    .map((p) => ({ id: p.id, price: monthlyPriceFor(p, vehicles) }))
    .sort((a, b) => a.price - b.price);
  const bestValueId = eligible[0]?.id ?? null;

  const clamp = (n: number) => Math.max(MIN_V, Math.min(MAX_V, n));

  return (
    <>
      <div className="calc reveal">
        <div className="calc-head">
          <span className="calc-q">How many vehicles do you run?</span>
          <div className="calc-stepper">
            <button type="button" className="calc-btn" aria-label="Fewer vehicles" onClick={() => setVehicles((v) => clamp(v - 1))} disabled={vehicles <= MIN_V}>−</button>
            <span className="calc-count"><b>{vehicles}</b> {vehicles === 1 ? 'vehicle' : 'vehicles'}</span>
            <button type="button" className="calc-btn" aria-label="More vehicles" onClick={() => setVehicles((v) => clamp(v + 1))} disabled={vehicles >= MAX_V}>+</button>
          </div>
        </div>
        <input
          className="calc-range"
          type="range"
          min={MIN_V}
          max={MAX_V}
          value={vehicles}
          onChange={(e) => setVehicles(Number(e.target.value))}
          aria-label="Number of vehicles"
        />
        <div className="calc-scale"><span>{MIN_V}</span><span>{MAX_V}+</span></div>
      </div>

      <div className="price-grid reveal-stagger">
        {plans.map((plan) => {
          const allowed = planAllowsVehicles(plan, vehicles);
          const price = monthlyPriceFor(plan, vehicles);
          const extra = plan.includedVehicles != null && plan.perVehiclePrice != null
            ? Math.max(0, vehicles - plan.includedVehicles)
            : 0;
          const isBest = plan.id === bestValueId;
          const ctaLabel = plan.ctaLabel ?? (plan.isCustom ? 'Book a demo' : 'Start free trial');
          const ctaClass = `btn ${plan.isPopular ? 'btn-primary' : 'btn-ghost'}`;
          return (
            <div key={plan.id} className={`plan${plan.isPopular ? ' feat' : ''}${!allowed ? ' plan-na' : ''}`}>
              {plan.isPopular && <div className="pop">Most popular</div>}
              {isBest && !plan.isPopular && <div className="pop pop-best">Best value</div>}
              <div className="pname">{plan.name}</div>
              {plan.blurb && <div className="pdesc">{plan.blurb}</div>}

              <div className="pprice">
                {plan.isCustom ? (
                  <span className="amt">{plan.priceLabel}</span>
                ) : allowed ? (
                  <><span className="amt">€{price}</span><span className="per">/ mo</span></>
                ) : (
                  <span className="amt amt-na">Too many cars</span>
                )}
              </div>

              {/* Live breakdown of how the price was reached. */}
              {!plan.isCustom && allowed && (
                <div className="pbreak">
                  {extra > 0 ? (
                    <>€{plan.priceAmount} base + {extra} × €{plan.perVehiclePrice}</>
                  ) : plan.includedVehicles != null ? (
                    <>{plan.includedVehicles} vehicles included</>
                  ) : (
                    <>flat — unlimited vehicles</>
                  )}
                </div>
              )}
              {!plan.isCustom && !allowed && (
                <div className="pbreak pbreak-na">Caps at {plan.maxVehicles} vehicles — size up</div>
              )}

              <ul className="pfeat">
                {plan.features.map((f) => (
                  <li key={f}><span className="tick"><Check /></span> {f}</li>
                ))}
              </ul>

              {plan.ctaHref ? (
                <a className={ctaClass} href={plan.ctaHref}>{ctaLabel}</a>
              ) : (
                <Link className={ctaClass} href={START_TRIAL} aria-disabled={!allowed}>{ctaLabel}</Link>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
