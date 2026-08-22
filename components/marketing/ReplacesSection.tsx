'use client';

import { useState } from 'react';
import Link from 'next/link';
import { START_TRIAL } from './links';

// =============================================================================
// "ONE APP INSTEAD OF ALL OF THESE" — the consolidation pitch
// =============================================================================
// The strongest sales argument Rovora has: most fleets already run on a
// patchwork of consumer apps — Excel for pay, WhatsApp for shifts, Life360 to
// see where cars are, Xero for the books. This section names that patchwork,
// shows it visually converging into Rovora, and lets the visitor recognise
// their own phone's home screen in it.
//
// LOGOS: drop square, transparent PNGs into /public/replaces/ using the exact
// filenames below (see the README there). Until a file exists, the chip shows
// a neutral monogram instead of a broken image — the section ships fine today
// and upgrades itself as logos land.
// =============================================================================

type App = {
  /** Expected file in /public/replaces/ */
  file: string;
  name: string;
  /** The job the fleet was doing in that app — the pain, in three words. */
  role: string;
  /** Position of the chip's centre in the desktop stage, in % of its box. */
  x: number;
  y: number;
};

const APPS: App[] = [
  { file: 'excel.png', name: 'Excel', role: 'pay spreadsheets', x: 12, y: 20 },
  { file: 'google-sheets.png', name: 'Google Sheets', role: 'vehicle logs', x: 9, y: 58 },
  { file: 'whatsapp.webp', name: 'WhatsApp', role: 'shift group chats', x: 19, y: 88 },
  { file: 'life360.png', name: 'Life360', role: 'driver tracking', x: 33, y: 9 },
  { file: 'google-calendar.webp', name: 'Google Calendar', role: 'rosters', x: 67, y: 9 },
  { file: 'xero.png', name: 'Xero', role: 'the books', x: 88, y: 20 },
  { file: 'quickbooks.png', name: 'QuickBooks', role: 'invoices', x: 91, y: 58 },
  { file: 'google-maps.png', name: 'Google Maps', role: '“where are you?”', x: 81, y: 88 },
];

/**
 * One app chip. Falls back to a monogram when the logo file hasn't been added
 * yet, so a missing image never renders as a broken-image icon.
 */
function AppChip({ app }: { app: App }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="rep-chip"
      style={{ left: `${app.x}%`, top: `${app.y}%` }}
    >
      {failed ? (
        <span className="rep-mono" aria-hidden>{app.name[0]}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- tiny local logos; the optimizer adds nothing here
        <img
          className="rep-logo"
          src={`/replaces/${app.file}`}
          alt=""
          width={26}
          height={26}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <span className="rep-chip-txt">
        <span className="rep-chip-name">{app.name}</span>
        <span className="rep-chip-role">{app.role}</span>
      </span>
    </div>
  );
}

export default function ReplacesSection() {
  return (
    <section className="sec-pad" id="replaces">
      <div className="container">
        <div className="sec-head center reveal">
          <span className="kicker">All-in-one</span>
          <h2 className="sec-title">One app instead of all of these.</h2>
          <p className="sec-desc">
            Most fleets run on a patchwork — spreadsheets for pay, group chats for shifts, a family
            tracker to see the cars, accounting software for the books. Rovora does the lot from one
            login, and your accountant still gets clean Xero and QuickBooks exports.
          </p>
        </div>

        <div className="rep-stage reveal" role="img" aria-label="Excel, Google Sheets, WhatsApp, Life360, Google Calendar, Google Maps, Xero and QuickBooks all converging into Rovora">
          {/* Connector lines, drawn in the same %-coordinate space the chips are
              positioned in, so they track the chips at any container size. */}
          <svg className="rep-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {APPS.map((a) => (
              <line
                key={a.file}
                className="rep-line"
                x1={a.x}
                y1={a.y}
                x2={50}
                y2={50}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {APPS.map((a) => <AppChip key={a.file} app={a} />)}

          {/* Mobile-only connector — on small screens the constellation becomes
              a plain grid with the hub underneath. */}
          <div className="rep-arrow" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v16M6 14l6 6 6-6" />
            </svg>
          </div>

          <div className="rep-hub">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" width={40} height={40} />
            <span className="rep-hub-name">Rovora</span>
            <span className="rep-hub-sub">One login · one bill</span>
          </div>
        </div>

        <div className="rep-cta reveal">
          <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
          <Link className="btn btn-ghost btn-lg" href="/integrations">See all integrations</Link>
        </div>
      </div>
    </section>
  );
}
