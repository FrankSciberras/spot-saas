'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '../feature/icons';
import StoreButtons from './StoreButtons';

// =============================================================================
// THE EVERYDAY TOOLKIT — homepage product tour
// =============================================================================
// Eight tiles (a tablist) on the left; the selected tool's headline, a screen
// from the demo account and a link to its feature page on the right. Screens
// that exist as real screenshots are images in /public/home; the settlement,
// roster and driver-app views are drawn in HTML with the same demo data.
// =============================================================================

/** Browser-window frame around a screen, captioned with where it's from. */
function Shot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="app-shot">
      <div className="app-shot-bar" aria-hidden="true"><span /><span /><span /><em>{label}</em></div>
      {children}
    </figure>
  );
}

function Img({ src, w, h, alt }: { src: string; w: number; h: number; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small pre-sized webp screenshots
  return <img src={src} width={w} height={h} alt={alt} loading="lazy" decoding="async" />;
}

function SettlementMock() {
  const rows: [string, string, string, string][] = [
    ['DM', 'Daniel M.', 'RVR-204', '€851'],
    ['LS', 'Luca S.', 'RVR-101', '€806'],
    ['MA', 'Mark A.', 'RVR-318', '€914'],
    ['RC', 'Ryan C.', 'RVR-422', '€782'],
    ['JP', 'Jean P.', 'RVR-509', '€869'],
  ];
  return (
    <div className="tk-settle" role="img" aria-label="Demo weekly settlement for driver Daniel M.: gross rides €1,840, platform fees €386, a 50/50 split, €124 tips and an €851 payout. Five drivers' payouts total €4,222.">
      <div className="tk-settle-main">
        <div className="tk-settle-head"><strong>Weekly settlement</strong><span>Week 27 · 29 Jun – 5 Jul</span></div>
        <div className="tk-settle-driver"><span className="tk-av">DM</span><span><strong>Daniel M.</strong><small>RVR-204 · 50 / 50 split</small></span></div>
        <dl className="tk-lines">
          <div><dt>Gross rides</dt><dd>€1,840</dd></div>
          <div><dt>Platform fees</dt><dd className="neg">−€386</dd></div>
          <div className="sum"><dt>Net after fees</dt><dd>€1,454</dd></div>
          <div><dt>Driver share · 50%</dt><dd>€727</dd></div>
          <div><dt>Tips · 100% to driver</dt><dd className="pos">+€124</dd></div>
        </dl>
        <div className="tk-payout"><span><small>Driver payout</small><strong>€851</strong></span><em>Ready for review</em></div>
      </div>
      <div className="tk-settle-side">
        <div className="tk-side-head">All drivers · Week 27</div>
        {rows.map(([i, n, plate, amt]) => (
          <div className="tk-side-row" key={n}><span className="tk-av sm">{i}</span><span>{n}<small>{plate}</small></span><b>{amt}</b></div>
        ))}
        <div className="tk-side-total"><span>Total payouts</span><b>€4,222</b></div>
      </div>
    </div>
  );
}

const ROSTER: [string, string, string, string[]][] = [
  ['DM', 'Daniel M.', 'RVR-204', ['d', 'd', 'd', 'd', 'd', '-', '-']],
  ['LS', 'Luca S.', 'RVR-101', ['l', 'l', '-', 'd', 'd', 'd', '-']],
  ['MA', 'Mark A.', 'RVR-318', ['-', 'd', 'd', 'l', 'l', '-', 'd']],
  ['RC', 'Ryan C.', 'RVR-422', ['d', '-', 'l', 'l', '-', 'd', 'd']],
  ['JP', 'Jean P.', 'RVR-509', ['l', 'l', 'd', '-', 'd', 'l', '-']],
];
const DAYS = ['Mon 29', 'Tue 30', 'Wed 1', 'Thu 2', 'Fri 3', 'Sat 4', 'Sun 5'];
const SHIFT: Record<string, [string, string]> = { d: ['day', '06–14'], l: ['late', '14–22'], '-': ['off', 'Off'] };

function RosterMock() {
  return (
    <div className="tk-roster">
      <div className="tk-roster-head"><strong>Rosters</strong><span>Week 27 · 29 Jun – 5 Jul</span><em>Published to drivers</em></div>
      <div className="tk-roster-scroll">
        <table>
          <caption className="sr-only">Demo weekly roster for five drivers. Day shift 06:00 to 14:00, late shift 14:00 to 22:00.</caption>
          <thead><tr><th scope="col">Driver</th>{DAYS.map((d) => <th scope="col" key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {ROSTER.map(([i, name, plate, week]) => (
              <tr key={name}>
                <th scope="row"><span className="tk-av sm">{i}</span><span className="tk-rname">{name}<small>{plate}</small></span></th>
                {week.map((s, d) => <td key={d}><span className={`tk-shift ${SHIFT[s][0]}`}>{SHIFT[s][1]}</span></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DriverAppPanel() {
  return (
    <>
      <div className="tk-driver">
        <div className="tk-phone" role="img" aria-label="Rovora driver app, demo data: this week's earnings €727 plus €124 tips, next shift Friday 06:00 to 14:00 in RVR-204, document reminders and a week 27 statement">
          <div className="tk-phone-card">
            <div className="tk-phone-k"><span>This week</span><em>+ €124 tips</em></div>
            <strong className="tk-phone-big">€727</strong>
            <div className="tk-bars" aria-hidden="true">{[38, 52, 44, 60, 86, 50, 34].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
          </div>
          <div className="tk-phone-card row"><span><small>Next shift</small>Fri 06:00 – 14:00</span><b>RVR-204</b></div>
          <div className="tk-phone-card">
            <div className="tk-phone-doc"><span>Driving licence<small>valid to 2028</small></span><em className="ok">Valid</em></div>
            <div className="tk-phone-doc"><span>Police conduct<small>renew by 08 Aug</small></span><em>30d</em></div>
          </div>
          <div className="tk-phone-card row"><span>Statements<small>Week 27 ready · PDF</small></span></div>
        </div>
        <ol className="tk-steps">
          <li><strong>You invite the driver</strong><span>From Drivers in your dashboard.</span></li>
          <li><strong>They download the app</strong><span>Android: Google Play. iPhone: sign in at rovora.eu.</span></li>
          <li><strong>They sign in</strong><span>Shifts, earnings and statements appear straight away.</span></li>
        </ol>
      </div>
      <StoreButtons />
    </>
  );
}

interface Tool {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  heading: string;
  body: string;
  visual: ReactNode;
  href: string;
  linkLabel: string;
}

const TOOLS: Tool[] = [
  {
    key: 'pay', icon: 'coins', title: 'Driver settlements', sub: 'Weekly pay, worked out.',
    heading: 'Driver pay, calculated every week.',
    body: 'Rides, platform fees, tips and the agreed split are worked out per driver. You review and approve each payout.',
    visual: <Shot label="Settlements · demo data"><SettlementMock /></Shot>,
    href: '/features/settlements', linkLabel: 'See how settlements work',
  },
  {
    key: 'tracking', icon: 'mapPin', title: 'Live map', sub: 'Every vehicle, live.',
    heading: 'See where every driver is, right now.',
    body: 'Drivers and vehicles on one map, from the driver app or your connected GPS trackers.',
    visual: <Shot label="Live map · demo account"><Img src="/home/live-map.webp" w={1266} h={650} alt="Rovora demo account: live map showing five drivers and their vehicles" /></Shot>,
    href: '/features/live-tracking', linkLabel: 'See live tracking',
  },
  {
    key: 'rosters', icon: 'calendar', title: 'Rosters & shifts', sub: 'Who drives, and when.',
    heading: 'Plan the week in minutes.',
    body: 'Assign drivers and vehicles to shifts. Drivers see their roster in the app.',
    visual: <Shot label="Rosters · sample layout, demo data"><RosterMock /></Shot>,
    href: '/features/rosters', linkLabel: 'See rosters',
  },
  {
    key: 'vehicles', icon: 'car', title: 'Vehicles', sub: 'Your whole fleet, one list.',
    heading: 'Every vehicle, at a glance.',
    body: 'Status, utilisation, mileage and assigned driver for each vehicle.',
    visual: <Shot label="Vehicles · demo account"><Img src="/home/vehicles.webp" w={1190} h={700} alt="Rovora demo account: vehicles list with utilisation, odometer and assigned driver for five vehicles" /></Shot>,
    href: '/features/vehicles', linkLabel: 'See vehicles',
  },
  {
    key: 'documents', icon: 'file', title: 'Documents & renewals', sub: 'Never miss an expiry.',
    heading: 'Renewals flagged before they’re due.',
    body: 'Store licences, insurance and permits for drivers and vehicles. Rovora shows what’s due and what’s overdue.',
    visual: <Shot label="Dashboard · demo account"><Img src="/home/expiring-soon.webp" w={402} h={270} alt="Rovora demo account: Expiring soon list with overdue police conduct, road licence, insurance and driving licence renewals" /></Shot>,
    href: '/features/vehicles', linkLabel: 'See documents',
  },
  {
    key: 'maintenance', icon: 'wrench', title: 'Maintenance & damages', sub: 'Services and repairs, logged.',
    heading: 'Keep every vehicle road-ready.',
    body: 'Mileage, next service, documents and damage reports in one vehicle record.',
    visual: <Shot label="Vehicle record · demo account"><Img src="/home/vehicle-record.webp" w={1162} h={700} alt="Rovora demo account: vehicle record for RVR-204 showing 48,230 km mileage, next service in 1,770 km and documents" /></Shot>,
    href: '/features/maintenance', linkLabel: 'See maintenance',
  },
  {
    key: 'bookkeeping', icon: 'chart', title: 'Bookkeeping', sub: 'Income, costs and profit.',
    heading: 'Know if the week made money.',
    body: 'Income, expenses, profit and margin for the whole fleet, week by week.',
    visual: <Shot label="Dashboard · demo account"><Img src="/home/earnings.webp" w={716} h={350} alt="Rovora demo account: earnings chart showing income €9,240, expenses €7,092, profit €2,148 and 23.3% margin" /></Shot>,
    href: '/features/bookkeeping', linkLabel: 'See bookkeeping',
  },
  {
    key: 'driver-app', icon: 'phone', title: 'Driver app', sub: 'Drivers download the app.',
    heading: 'Drivers: download the Rovora app.',
    body: 'Each driver gets their own app with shifts, weekly earnings, pay statements and document reminders. You invite them from the dashboard.',
    visual: <DriverAppPanel />,
    href: '/features/driver-app', linkLabel: 'See the driver app',
  },
];

export default function Toolkit() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between tiles (and select them), as a tablist should.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = TOOLS.length;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : null;
    if (next == null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="tk-layout">
      <div className="tk-tabs" role="tablist" aria-label="Explore the Everyday Toolkit">
        {TOOLS.map((t, i) => {
          const I = Icon[t.icon];
          const selected = i === active;
          return (
            <button
              key={t.key}
              ref={(el) => { tabs.current[i] = el; }}
              type="button"
              role="tab"
              id={`tk-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`tk-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              className="tk-tile"
              data-track="Feature opened"
              data-track-label={t.title}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="tk-ico" aria-hidden="true"><I /></span>
              <span className="tk-tile-text"><strong>{t.title}</strong><span>{t.sub}</span></span>
            </button>
          );
        })}
      </div>

      <div className="tk-panels">
        {TOOLS.map((t, i) => (
          <div
            key={t.key}
            className="tk-panel"
            role="tabpanel"
            id={`tk-panel-${t.key}`}
            aria-labelledby={`tk-tab-${t.key}`}
            tabIndex={0}
            hidden={i !== active}
          >
            <h3>{t.heading}</h3>
            <p>{t.body}</p>
            {t.visual}
            <Link className="text-link" href={t.href}>
              {t.linkLabel}
              <Icon.arrowRight aria-hidden="true" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
