'use client';

import { Fragment, useState } from 'react';
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
const MAX_V = 80;

// Feature comparison matrix. Cell values are keyed by plan id
// ('starter' | 'growth' | 'scale' | 'enterprise'): true = tick, an absent key
// (or false) = not included, a string = a value shown in the cell. Only real,
// shipped features are listed — new capabilities get a row when they ship.
//
// The "Vehicles & team" group is NOT hardcoded — its included-vehicles, per-extra
// price and vehicle-limit rows are derived from the live plan catalogue (same DB
// rows that drive the price cards above) so an /admin price edit can never make
// this table contradict the cards. The remaining groups describe feature
// availability, which only changes on a code deploy.
type CmpVal = boolean | string;

const fmtIncluded = (p: PlanDef): CmpVal =>
  p.isCustom ? 'Custom' : p.includedVehicles == null ? '∞' : String(p.includedVehicles);
const fmtPerVehicle = (p: PlanDef): CmpVal =>
  p.isCustom ? 'Volume' : p.perVehiclePrice == null ? '—' : `€${p.perVehiclePrice}`;
const fmtVehicleLimit = (p: PlanDef): CmpVal =>
  p.isCustom || p.maxVehicles == null ? 'Unlimited' : String(p.maxVehicles);

/** Rows whose values come straight from the catalogue, keyed by plan id. */
function vehicleTeamRows(plans: PlanDef[]): { label: string; vals: Record<string, CmpVal> }[] {
  const mk = (fn: (p: PlanDef) => CmpVal) => Object.fromEntries(plans.map((p) => [p.id, fn(p)]));
  return [
    { label: 'Vehicles included', vals: mk(fmtIncluded) },
    { label: 'Price per extra vehicle', vals: mk(fmtPerVehicle) },
    { label: 'Vehicle limit', vals: mk(fmtVehicleLimit) },
    { label: 'Team members', vals: mk(() => 'Unlimited') },
    { label: 'Free driver app', vals: mk(() => true) },
  ];
}

// Feature-availability groups (not price/limit data) — static, keyed by plan id.
const FEATURE_GROUPS: { group: string; rows: { label: string; vals: Record<string, CmpVal> }[] }[] = [
  {
    group: 'Tracking & operations',
    rows: [
      { label: 'Live GPS map', vals: { starter: 'Basic', growth: 'Full', scale: 'Full', enterprise: 'Full' } },
      { label: 'Zones, speed & route playback', vals: { growth: true, scale: true, enterprise: true } },
      { label: 'Speeding & lost-signal alerts', vals: { growth: true, scale: true, enterprise: true } },
      { label: 'Shifts & weekly rosters', vals: { starter: true, growth: true, scale: true, enterprise: true } },
      { label: 'Pre-shift vehicle inspections', vals: { starter: true, growth: true, scale: true, enterprise: true } },
      { label: 'Service, damage & maintenance logs', vals: { starter: true, growth: true, scale: true, enterprise: true } },
    ],
  },
  {
    group: 'Driver pay & money',
    rows: [
      { label: 'Driver settlements & weekly pay', vals: { growth: true, scale: true, enterprise: true } },
      { label: 'Uber / Bolt / eCabs CSV import', vals: { growth: true, scale: true, enterprise: true } },
      { label: 'Financials & bookkeeping', vals: { growth: true, scale: true, enterprise: true } },
      { label: 'Document-expiry alerts', vals: { starter: 'Basic', growth: 'Full', scale: 'Full', enterprise: 'Full' } },
    ],
  },
  {
    group: 'Support & onboarding',
    rows: [
      { label: 'Support', vals: { starter: 'Email', growth: 'Priority', scale: 'Priority', enterprise: 'Dedicated' } },
      { label: 'We import your data', vals: { scale: true, enterprise: true } },
      { label: 'Onboarding', vals: { starter: 'Self-serve', growth: 'Self-serve', scale: 'Guided', enterprise: 'White-glove' } },
    ],
  },
];

/** Full comparison matrix: catalogue-derived vehicle rows + static feature rows. */
function buildCompare(plans: PlanDef[]) {
  return [{ group: 'Vehicles & team', rows: vehicleTeamRows(plans) }, ...FEATURE_GROUPS];
}

function Cell({ v }: { v: CmpVal | undefined }) {
  if (v === true) return <span className="cmp-yes"><Check /></span>;
  if (v == null || v === false) return <span className="cmp-no" aria-label="Not included">–</span>;
  return <span className="cmp-val">{v}</span>;
}

/**
 * Interactive pricing — an operator drags/steps the vehicle count and every
 * self-serve plan's monthly price updates live (base + per-vehicle add-on). The
 * plan that fits the chosen count for the lowest price is flagged "Best value".
 * Custom-priced tiers (Enterprise) render as a contact band below the grid, and
 * a full feature comparison table sits underneath.
 */
export default function PricingPlans({ plans }: { plans: PlanDef[] }) {
  const [vehicles, setVehicles] = useState(1);

  const cardPlans = plans.filter((p) => !p.isCustom);
  const customPlans = plans.filter((p) => p.isCustom);

  // Lowest-priced self-serve plan whose hard cap allows this many vehicles.
  const eligible = cardPlans
    .filter((p) => planAllowsVehicles(p, vehicles))
    .map((p) => ({ id: p.id, price: monthlyPriceFor(p, vehicles) }))
    .sort((a, b) => a.price - b.price);
  const bestValueId = eligible[0]?.id ?? null;
  const compare = buildCompare(plans);

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
        {cardPlans.map((plan) => {
          const allowed = planAllowsVehicles(plan, vehicles);
          const price = monthlyPriceFor(plan, vehicles);
          const extra = plan.includedVehicles != null && plan.perVehiclePrice != null
            ? Math.max(0, vehicles - plan.includedVehicles)
            : 0;
          const isBest = plan.id === bestValueId;
          const ctaLabel = plan.ctaLabel ?? 'Start free trial';
          const ctaClass = `btn ${plan.isPopular ? 'btn-primary' : 'btn-ghost'}`;
          return (
            <div key={plan.id} className={`plan${plan.isPopular ? ' feat' : ''}${!allowed ? ' plan-na' : ''}`}>
              {plan.isPopular && <div className="pop">Most popular</div>}
              {isBest && !plan.isPopular && <div className="pop pop-best">Best value</div>}
              <div className="pname">{plan.name}</div>
              {plan.blurb && <div className="pdesc">{plan.blurb}</div>}

              <div className="pprice">
                {allowed ? (
                  <><span className="amt">€{price}</span><span className="per">/ mo</span></>
                ) : (
                  <span className="amt amt-na">Too many cars</span>
                )}
              </div>

              {/* Live breakdown of how the price was reached. */}
              {allowed && (
                <div className="pbreak">
                  {extra > 0 ? (
                    <>€{plan.priceAmount} base + {extra} × €{plan.perVehiclePrice}</>
                  ) : plan.includedVehicles != null ? (
                    <>{plan.includedVehicles} vehicles included</>
                  ) : (
                    <>{plan.billingNote}</>
                  )}
                </div>
              )}
              {!allowed && (
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

      {customPlans.map((plan) => (
        <div className="ent-band reveal" key={plan.id}>
          <div className="ent-main">
            <div className="ent-name">{plan.name}</div>
            {plan.blurb && <div className="ent-desc">{plan.blurb}</div>}
            <ul className="ent-feat">
              {plan.features.map((f) => (
                <li key={f}><span className="tick"><Check /></span> {f}</li>
              ))}
            </ul>
          </div>
          <div className="ent-cta">
            <div className="ent-price">{plan.priceLabel}</div>
            {plan.capLabel && <div className="ent-cap">{plan.capLabel}</div>}
            <a className="btn btn-primary" href={plan.ctaHref ?? '/contact'}>{plan.ctaLabel ?? 'Talk to us'}</a>
          </div>
        </div>
      ))}

      <div className="cmp-wrap reveal">
        <div className="cmp-title">Compare every plan</div>
        <div className="cmp-scroll">
          <table className="cmp">
            <thead>
              <tr>
                <th className="cmp-feat-h">Features</th>
                {plans.map((p) => (
                  <th key={p.id} className={p.isPopular ? 'cmp-pop' : ''}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compare.map((grp) => (
                <Fragment key={grp.group}>
                  <tr className="cmp-grp"><td colSpan={plans.length + 1}>{grp.group}</td></tr>
                  {grp.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="cmp-feat">{row.label}</td>
                      {plans.map((p) => (
                        <td key={p.id} className={p.isPopular ? 'cmp-pop' : ''}><Cell v={row.vals[p.id]} /></td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
