'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';

// =============================================================================
// FEATURES ACCORDION — homepage "Run operations from a single screen"
// =============================================================================
// Left: one row per feature; the open row shows its description, three proof
// points and a "Learn more" link. Right: a product mock for the open feature.
// Replaces the three stacked feature rows + six-card grid, which spent ~3
// screenfuls saying the same thing this does in one.
// =============================================================================

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7" /></svg>
);

const Lock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

/** Browser-frame chrome above a mock, same look as the rest of the page. */
function ShotBar({ path }: { path: string }) {
  return (
    <div className="shot-bar">
      <div className="dots"><i /><i /><i /></div>
      <div className="shot-url">
        <Lock />
        app.rovora.eu/<b>{path}</b>
      </div>
    </div>
  );
}

interface Feature {
  key: string;
  title: string;
  desc: string;
  points: string[];
  href: string;
  shot: ReactNode;
}

const FEATURES: Feature[] = [
  {
    key: 'live',
    title: 'Live shift status',
    desc: 'Every clock-in, shift hour and euro earned, streaming in as it happens. Know who is driving, who is available and who is running late — without making a single call.',
    points: ['On shift, off duty or running late — at a glance', 'Per-driver earnings as the day unfolds', 'Document checks flagged before they expire'],
    href: '/features/live-tracking',
    shot: (
      <>
        <ShotBar path="drivers" />
        <div className="mock">
          <div className="mock-rows">
            <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="amt">€412</span><span className="st">On shift</span></div>
            <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="amt">€388</span><span className="st">On shift</span></div>
            <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="amt">€201</span><span className="st">On shift</span></div>
            <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="amt">€0</span><span className="st idle">Off duty</span></div>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'tracking',
    title: 'Live tracking, no hardware',
    desc: 'Traditional tracking means €100+ GPS boxes wired into every car, SIM contracts and an installer. Rovora turns the phone your driver already carries into the tracker — switched on with one tap at shift start, off when the shift ends.',
    points: ['Live map with speed per driver, zones and entry/exit alerts', 'Trip and stop history with route playback, plus driver safety scores', 'No devices, no installation, no SIM contracts — a 10-car fleet saves €1,000+ up front'],
    href: '/features/live-tracking',
    shot: (
      <>
        <ShotBar path="fleet/tracking" />
        <div className="mapmock" aria-hidden="true">
          <div className="mm-roads" />
          <div className="mm-zone">
            <span className="mm-zone-tag">Airport</span>
          </div>
          <div className="mm-drv mm-drv1">
            <span className="mm-dot" style={{ background: '#2bbd7e' }}>MV</span>
            <span className="mm-spd">62 km/h</span>
          </div>
          <div className="mm-drv mm-drv2">
            <span className="mm-dot" style={{ background: '#3b6ad9' }}>JB</span>
            <span className="mm-spd">48 km/h</span>
          </div>
          <div className="mm-drv mm-drv3">
            <span className="mm-dot" style={{ background: '#a78bfa' }}>KW</span>
            <span className="mm-spd">35 km/h</span>
          </div>
          <div className="mm-toast">
            <span className="mm-toast-dot" />
            <span><b>Zone alert</b> — M. Vella entered “Airport”</span>
          </div>
          <div className="mm-legend">
            <span><i className="mm-leg-dot" /> 3 drivers live</span>
            <span className="mm-leg-sep">·</span>
            <span>updating in real time</span>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'pay',
    title: 'Driver pay & settlements',
    desc: 'Import your Uber and Bolt statements and Rovora does the maths for every driver — gross splits, fees, cash drops, tips and adjustments — then hands you clean, payable settlements.',
    points: ['Uber and Bolt statements imported, calculations automated', 'Adjustments, deductions and cash drops handled', 'Month-end PDF statements, ready for the books'],
    href: '/features/settlements',
    shot: (
      <>
        <ShotBar path="settlements" />
        <div className="mock">
          <div className="mock-rows">
            <div className="mock-row"><span className="nm">A. Murphy</span><span className="meta">· Uber · wk 22</span><span className="amt">€1,284</span><span className="st">Payable</span></div>
            <div className="mock-row"><span className="nm">J. Byrne</span><span className="meta">· Bolt · wk 22</span><span className="amt">€1,107</span><span className="st">Payable</span></div>
            <div className="mock-row"><span className="nm">S. Doyle</span><span className="meta">· Uber · wk 22</span><span className="amt">€642</span><span className="st idle">Review</span></div>
            <div className="mock-row"><span className="nm">K. Walsh</span><span className="meta">· Bolt · wk 22</span><span className="amt">€918</span><span className="st">Payable</span></div>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'vehicles',
    title: 'Vehicles & documents',
    desc: 'Every plate, odometer reading and document in one place — with utilisation tracking and expiry alerts that warn you weeks before a road licence or insurance lapses.',
    points: ['Live utilisation per vehicle, 7-day average', 'Service, idle and active status at a glance', 'Tiered alerts for every expiring document'],
    href: '/features/vehicles',
    shot: (
      <>
        <ShotBar path="vehicles" />
        <div className="mock">
          <div className="mock-cards">
            <div className="mock-card"><div className="k">Active</div><div className="v pos">11</div></div>
            <div className="mock-card"><div className="k">Idle</div><div className="v">2</div></div>
            <div className="mock-card"><div className="k">Service</div><div className="v">1</div></div>
            <div className="mock-card"><div className="k">Expiring</div><div className="v accent">3</div></div>
          </div>
          <div className="mock-rows">
            <div className="mock-row"><span className="nm mono">ABC 123</span><span className="meta">· 84% used</span><span className="st">Active</span></div>
            <div className="mock-row"><span className="nm mono">KLM 456</span><span className="meta">· 77% used</span><span className="st">Active</span></div>
            <div className="mock-row"><span className="nm mono">XYZ 789</span><span className="meta">· idle 2d</span><span className="st idle">Idle</span></div>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'rosters',
    title: 'Rosters',
    desc: 'Build weekly schedules, assign cars to drivers and catch clashes before the shift starts. Drivers see their week in the app the moment you publish.',
    points: ['Weekly grid: drivers × vehicles × days', 'Publish once — every driver is notified', 'Copy last week forward in one tap'],
    href: '/features/rosters',
    shot: (
      <>
        <ShotBar path="rosters" />
        <div className="mock">
          <div className="mock-rows">
            <div className="mock-row"><span className="nm">Mon</span><span className="meta">· ABC 123</span><span className="meta">A. Murphy</span><span className="st">Published</span></div>
            <div className="mock-row"><span className="nm">Tue</span><span className="meta">· ABC 123</span><span className="meta">J. Byrne</span><span className="st">Published</span></div>
            <div className="mock-row"><span className="nm">Wed</span><span className="meta">· KLM 456</span><span className="meta">S. Doyle</span><span className="st">Published</span></div>
            <div className="mock-row"><span className="nm">Thu</span><span className="meta">· KLM 456</span><span className="meta">K. Walsh</span><span className="st idle">Draft</span></div>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'money',
    title: 'Financials & bookkeeping',
    desc: 'Income, expenses and profit across the fleet — by week, month or your own pay period — with every transaction categorised and VAT-ready, so month-end takes minutes.',
    points: ['Profit per vehicle and per driver', 'Running costs, fuel and repairs logged against each car', 'Clean CSV for Xero and QuickBooks'],
    href: '/features/flexible-pay',
    shot: (
      <>
        <ShotBar path="financials" />
        <div className="mock">
          <div className="mock-cards">
            <div className="mock-card"><div className="k">Income</div><div className="v pos">€18.4k</div></div>
            <div className="mock-card"><div className="k">Expenses</div><div className="v">€6.1k</div></div>
            <div className="mock-card"><div className="k">Driver pay</div><div className="v">€8.9k</div></div>
            <div className="mock-card"><div className="k">Profit</div><div className="v accent">€3.4k</div></div>
          </div>
          <div className="mock-rows">
            <div className="mock-row"><span className="nm">Fuel</span><span className="meta">· 14 entries</span><span className="amt">−€2,140</span></div>
            <div className="mock-row"><span className="nm">Repairs</span><span className="meta">· 3 entries</span><span className="amt">−€860</span></div>
            <div className="mock-row"><span className="nm">Insurance</span><span className="meta">· monthly</span><span className="amt">−€1,220</span></div>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'damages',
    title: 'Damages & maintenance',
    desc: 'Log incidents against any vehicle with photos on a car diagram, track repair costs, and let service reminders fire by kilometres or date — before the car is off the road.',
    points: ['Tap the damage zone on a car diagram', 'Repair history and cost per vehicle', 'Service due alerts by km and by date'],
    href: '/features/damage',
    shot: (
      <>
        <ShotBar path="damages" />
        <div className="mock">
          <div className="mock-rows">
            <div className="mock-row"><span className="nm mono">ABC 123</span><span className="meta">· front bumper · 2 photos</span><span className="amt">€340</span><span className="st idle">Repairing</span></div>
            <div className="mock-row"><span className="nm mono">KLM 456</span><span className="meta">· rear door · 1 photo</span><span className="amt">€120</span><span className="st">Repaired</span></div>
            <div className="mock-row"><span className="nm mono">XYZ 789</span><span className="meta">· service due in 400 km</span><span className="amt">—</span><span className="st idle">Due soon</span></div>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'alerts',
    title: 'Automated alerts',
    desc: 'Expiring documents, idle cars, forgotten shifts and pending settlements — surfaced in the app, by push or by email before they become a problem.',
    points: ['Document expiry at 30 days, 7 days and on the day', 'Service due, lost signal, shift still open', 'You choose the channel: in-app, push or email'],
    href: '/features/maintenance',
    shot: (
      <>
        <ShotBar path="notifications" />
        <div className="mock">
          <div className="mock-rows">
            <div className="mock-row"><span className="nm">Driving licence expires in 7 days</span><span className="meta">· A. Murphy</span><span className="st idle">Warning</span></div>
            <div className="mock-row"><span className="nm">Service due in 400 km</span><span className="meta">· XYZ 789</span><span className="st idle">Warning</span></div>
            <div className="mock-row"><span className="nm">Shift still open after 14 h</span><span className="meta">· S. Doyle</span><span className="st idle">Nudged</span></div>
            <div className="mock-row"><span className="nm">3 settlements ready to pay</span><span className="meta">· wk 22</span><span className="st">Action</span></div>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'app',
    title: 'Driver app',
    desc: 'Drivers clock in with a photo check, share their location for the shift, and see their roster and earnings — from a free app that needs no training.',
    points: ['Start and end shifts with odometer and photos', 'Live location only while on shift, started by the driver', 'Roster, settlements and notifications in one place'],
    href: '/features/live-tracking',
    shot: (
      <div className="facc-phone" aria-hidden="true">
        <div className="facc-phone-top"><span>Rovora Driver</span><span className="facc-phone-pill">On shift</span></div>
        <div className="mock-rows">
          <div className="mock-row"><span className="nm">Today</span><span className="meta">· ABC 123 · since 08:00</span><span className="amt">€142</span></div>
          <div className="mock-row"><span className="nm">This period</span><span className="meta">· 4 weeks</span><span className="amt">€1,284</span></div>
          <div className="mock-row"><span className="nm">Next shift</span><span className="meta">· Thu 07:30 · KLM 456</span></div>
        </div>
        <div className="facc-phone-btn">End shift</div>
      </div>
    ),
  },
];

export default function FeaturesAccordion() {
  const [active, setActive] = useState(0);
  const current = FEATURES[active];

  return (
    <div className="facc reveal">
      <div className="facc-list" role="list">
        {FEATURES.map((f, i) => {
          const open = i === active;
          return (
            <div className={`facc-item${open ? ' open' : ''}`} key={f.key} role="listitem">
              <button
                type="button"
                className="facc-head"
                aria-expanded={open}
                aria-controls={`facc-panel-${f.key}`}
                onClick={() => setActive(i)}
              >
                <span className="facc-title">{f.title}</span>
                <span className="facc-icon" aria-hidden="true">{open ? '−' : '+'}</span>
              </button>
              <div className="facc-body" id={`facc-panel-${f.key}`} hidden={!open}>
                <p>{f.desc}</p>
                <ul className="feat-list">
                  {f.points.map((p) => (
                    <li key={p}><span className="tick"><Check /></span> {p}</li>
                  ))}
                </ul>
                <Link className="facc-more" href={f.href}>
                  Learn more
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </Link>
                {/* On narrow screens the mock sits under the open row. */}
                <div className="facc-shot-inline shot tight">{f.shot}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="facc-stage">
        <div className="facc-shot shot tight" key={current.key}>{current.shot}</div>
      </div>
    </div>
  );
}
