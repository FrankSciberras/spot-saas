import Link from 'next/link';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import type { PlanDef } from '@/lib/billing/plans';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import RovoraReveal from './RovoraReveal';
import RovoraSmoothScroll from './RovoraSmoothScroll';
import RovoraSupportChat from './RovoraSupportChat';
import MarketingNav from './MarketingNav';
import MarketingFooter from './MarketingFooter';
import PricingPlans from './PricingPlans';
import LiteYouTube from './LiteYouTube';
import { SIGN_IN, START_TRIAL, featureHref } from './links';
import { Icon, type IconName } from './feature/icons';
import { markFontSize } from '@/lib/integrations/catalog';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Lock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/** Browser-frame mock used in place of product screenshots. */
function ShotBar({ path }: { path: string }) {
  return (
    <div className="shot-bar">
      <div className="dots">
        <i /><i /><i />
      </div>
      <div className="shot-url">
        <Lock />
        app.rovora.eu/<b>{path}</b>
      </div>
    </div>
  );
}

/** A representative tile from each marketplace category — full list at /integrations. */
const INTEGRATIONS: {
  name: string;
  mark: string;
  bg: string;
  fg: string;
  desc: string;
  live?: boolean;
}[] = [
  { name: 'Accountant CSV export', mark: 'CSV', bg: '#64748b', fg: '#ffffff', desc: 'QuickBooks & Xero-ready CSV of your books, one click.', live: true },
  { name: 'Wialon', mark: 'W', bg: '#f26722', fg: '#ffffff', desc: 'Import GPS positions & trips from your trackers.' },
  { name: 'Uber', mark: 'U', bg: '#000000', fg: '#ffffff', desc: 'Auto-import trips & weekly earnings.' },
  { name: 'WhatsApp', mark: 'WA', bg: '#25d366', fg: '#06341c', desc: 'Send shift reminders straight to drivers.' },
];

/** Quick "everything Rovora does" overview grid on the homepage. */
const WAYS: { icon: IconName; label: string; href: string }[] = [
  { icon: 'car', label: 'Manage your vehicles', href: featureHref('vehicles') },
  { icon: 'wrench', label: 'Never miss a service', href: featureHref('maintenance') },
  { icon: 'camera', label: 'Log damage & repairs', href: featureHref('damage') },
  { icon: 'pulse', label: 'Track live shifts', href: featureHref('live-tracking') },
  { icon: 'calendar', label: 'Plan weekly rosters', href: featureHref('rosters') },
  { icon: 'coins', label: 'Reconcile driver pay', href: featureHref('settlements') },
  { icon: 'shield', label: 'Stay compliant', href: '#features' },
  { icon: 'bell', label: 'Get smart alerts', href: '#features' },
];

/** Landing-page FAQ — rendered below and reused to build FAQPage JSON-LD in app/page.tsx. */
export const LANDING_FAQ: { q: string; a: string }[] = [
  {
    q: 'How long does it take to get set up?',
    a: "Most fleets are live in an afternoon. Add your vehicles and drivers, invite the team to the driver app, and you're running shifts the same day. On the Fleet plan we'll import your existing data for you.",
  },
  {
    q: 'Do my drivers need to install anything?',
    a: 'Drivers use the free Rovora driver app to clock in, log shifts and see their earnings. It takes a couple of minutes to set up and needs no training — if they can use a ride-hail app, they can use Rovora.',
  },
  {
    q: 'Do I need to buy GPS trackers for my cars?',
    a: "No. Rovora's live map works through the free driver app on the phone your driver already carries — no hardware to buy, install or maintain, and no SIM contracts. Drivers share their location with one tap when a shift starts, you see the whole fleet live, and tracking stops when they stop. For a 10-car fleet that's typically €1,000+ saved up front versus dedicated trackers.",
  },
  {
    q: 'Can I move over my current vehicles and drivers?',
    a: "Yes. You can add everything manually in minutes, or send us a spreadsheet and we'll import your vehicles, drivers and documents so nothing gets left behind.",
  },
  {
    q: 'How do driver settlements and payouts work?',
    a: "Rovora reconciles each driver's week automatically — gross splits, fees, cash drops, tips and any adjustments — then produces a clean, payable amount. You review, approve and run payouts in a single pass, with a PDF statement for your records.",
  },
  {
    q: 'Is my fleet data secure?',
    a: 'Your data is encrypted in transit and at rest, hosted in the EU, and only ever visible to your team. You can export everything at any time, and we never sell or share your data.',
  },
  {
    q: 'What if I run more than 75 vehicles?',
    a: "Up to 75 vehicles you're self-serve on the Fleet plan, priced by the car. Above that, our Enterprise plan adds custom volume pricing, white-glove onboarding and a dedicated account manager — get in touch and we'll tailor it to your operation.",
  },
];

const SITE_URL = 'https://rovora.eu';

/** Structured data for SEO — WebSite, Organization, FAQPage and the priced Product offers. */
function buildJsonLd(plans: PlanDef[]) {
  const webSite = {
    '@type': 'WebSite',
    name: 'Rovora',
    alternateName: 'Rovora Fleet Management',
    url: SITE_URL,
  };

  const organization = {
    '@type': 'Organization',
    name: 'Rovora',
    url: SITE_URL,
    logo: `${SITE_URL}/icons/apple-touch-icon.png`,
    description:
      'Fleet management software for taxi & rideshare operators — vehicles, maintenance, damage, drivers, shifts and driver pay in one dashboard.',
    email: 'hello@rovora.eu',
  };

  const faqPage = {
    '@type': 'FAQPage',
    mainEntity: LANDING_FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  // SoftwareApplication (not Product) — Product markup with offers makes Google
  // validate it as a physical merchant listing (image/shipping/returns required).
  const softwareApp = {
    '@type': 'SoftwareApplication',
    name: 'Rovora Fleet Management',
    description:
      'All-in-one taxi & rideshare fleet management — vehicle upkeep, maintenance and damage tracking, rosters, live shifts, driver pay and compliance alerts.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    image: `${SITE_URL}/og-image.png`,
    brand: { '@type': 'Brand', name: 'Rovora' },
    offers: plans
      .filter((p) => p.priceAmount > 0)
      .map((p) => ({
        '@type': 'Offer',
        name: p.name,
        price: p.priceAmount,
        priceCurrency: 'EUR',
        url: `${SITE_URL}/#pricing`,
        availability: 'https://schema.org/InStock',
      })),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [webSite, organization, faqPage, softwareApp],
  };
}

export default function LandingPage({ plans }: { plans: PlanDef[] }) {
  const jsonLd = buildJsonLd(plans);
  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Without JS the reveal classes would leave content hidden — force it visible. */}
      <noscript>
        <style>{`.rovora-site .reveal{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <RovoraReveal />
      <RovoraSmoothScroll />
      <div className="wrap">
        <MarketingNav onHome />

        {/* HERO */}
        <section className="hero" id="top">
          <div className="container reveal-stagger">
            <span className="eyebrow"><span className="live" /> Built for fleets of 1 to 100+ vehicles</span>
            <h1 className="hero-title">Run your whole fleet from <span className="pos">one place</span>.</h1>
            <p className="hero-sub">Vehicles, maintenance, damage, drivers, live GPS tracking and pay — Rovora keeps every part of your operation in a single dashboard, so nothing slips through the cracks.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
              <a className="btn btn-ghost btn-lg" href="#how">See how it works</a>
            </div>
            <div className="hero-micro">
              <span><span className="ck">✓</span> {TRIAL_DAYS}-day free trial</span>
              <span><span className="ck">✓</span> No card required</span>
              <span><span className="ck">✓</span> Set up in an afternoon</span>
            </div>
            <div className="hero-trust">
              <span>EU-hosted</span>
              <span>·</span>
              <span>Encrypted</span>
              <span>·</span>
              <span>GDPR-compliant</span>
              <span>·</span>
              <span>Cancel anytime</span>
              <Link href="/security">Read our security &amp; privacy →</Link>
            </div>
          </div>
          <div className="container hero-shot-wrap reveal">
            <div className="shot">
              <ShotBar path="dashboard" />
              <div className="mock">
                <div className="mock-top">
                  <span className="mock-title">Fleet overview</span>
                  <span className="mock-pill">● Live</span>
                </div>
                <div className="mock-cards">
                  <div className="mock-card"><div className="k">Revenue / wk</div><div className="v">€18.4k</div></div>
                  <div className="mock-card"><div className="k">On shift</div><div className="v accent">14</div></div>
                  <div className="mock-card"><div className="k">Utilisation</div><div className="v pos">82%</div></div>
                  <div className="mock-card"><div className="k">Alerts</div><div className="v">3</div></div>
                </div>
                <div className="mock-rows">
                  <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="meta">· 12-D-4471</span><span className="amt">€412</span><span className="st">On shift</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="meta">· 21-C-9920</span><span className="amt">€388</span><span className="st">On shift</span></div>
                  <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="meta">· 19-L-1183</span><span className="amt">€0</span><span className="st idle">Off duty</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="stats">
          <div className="container">
            <div className="stats-grid reveal-stagger">
              <div className="stat"><div className="num mono">6<span style={{ fontSize: 24 }}> hrs</span></div><div className="lbl">saved every week on admin</div></div>
              <div className="stat"><div className="num mono">100<span style={{ fontSize: 24 }}>%</span></div><div className="lbl">document &amp; service compliance</div></div>
              <div className="stat"><div className="num mono">1</div><div className="lbl">dashboard for your whole fleet</div></div>
              <div className="stat"><div className="num mono">€0</div><div className="lbl">spent on GPS tracking hardware</div></div>
            </div>
          </div>
        </section>

        {/* SEE IT IN ACTION */}
        <section className="sec-pad" id="demo">
          <div className="container">
            <div className="sec-head center reveal">
              <span className="kicker">Watch</span>
              <h2 className="sec-title">See Rovora in action</h2>
              <p className="sec-desc">A quick tour of the dashboard — vehicles, drivers, live GPS tracking, weekly driver pay and the books, all in one place.</p>
            </div>
            <div className="shot reveal">
              <ShotBar path="dashboard" />
              <LiteYouTube id="LEqoWWGHekU" title="Rovora — fleet management demo" />
            </div>
          </div>
        </section>

        {/* OVERVIEW GRID */}
        <section className="sec-pad way">
          <div className="container">
            <div className="sec-head center reveal" style={{ marginBottom: 56 }}>
              <h2 className="sec-title">The modern way to run your fleet</h2>
              <p className="sec-desc">Everything you need to manage drivers, vehicles, shifts and pay — with the practical intelligence built into the workflows your team already uses every day.</p>
            </div>
            <div className="way-grid reveal-stagger">
              {WAYS.map((w) => {
                const I = Icon[w.icon];
                const inner = (
                  <>
                    <span className="way-ico"><I /></span>
                    <span className="way-label">{w.label}</span>
                  </>
                );
                return w.href.startsWith('#') ? (
                  <a className="way-item" href={w.href} key={w.label}>{inner}</a>
                ) : (
                  <Link className="way-item" href={w.href} key={w.label}>{inner}</Link>
                );
              })}
            </div>
            <div className="way-cta reveal">
              <a className="way-more" href="#features">
                See all features
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="sec-pad" id="features">
          <div className="container">
            <div className="sec-head center reveal" style={{ marginBottom: 72 }}>
              <span className="kicker">Everything in one place</span>
              <h2 className="sec-title">Run operations from a single screen</h2>
              <p className="sec-desc">No more jumping between WhatsApp, paper logs and three different spreadsheets. Rovora keeps the whole operation — and every euro — in view.</p>
            </div>

            {/* Feature 1 */}
            <div className="frow reveal">
              <div className="ftext">
                <div className="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a7 7 0 0 1 14 0v1" /></svg>
                </div>
                <h3>See who&apos;s on the road, live</h3>
                <p>Every clock-in, shift hour and euro earned, streaming in as it happens. Know exactly who&apos;s driving, who&apos;s available and who&apos;s running behind — without making a single call.</p>
                <ul className="feat-list">
                  <li><span className="tick"><Check /></span> Live shift status and hours <span className="t2">— on shift, off duty, running late</span></li>
                  <li><span className="tick"><Check /></span> Per-driver earnings as the day unfolds</li>
                  <li><span className="tick"><Check /></span> Document checks flagged before they expire</li>
                </ul>
              </div>
              <div className="shot tight">
                <ShotBar path="drivers" />
                <div className="mock">
                  <div className="mock-rows">
                    <div className="mock-row"><span className="av" /><span className="nm">A. Murphy</span><span className="amt">€412</span><span className="st">On shift</span></div>
                    <div className="mock-row"><span className="av" /><span className="nm">J. Byrne</span><span className="amt">€388</span><span className="st">On shift</span></div>
                    <div className="mock-row"><span className="av" /><span className="nm">S. Doyle</span><span className="amt">€201</span><span className="st">On shift</span></div>
                    <div className="mock-row"><span className="av" /><span className="nm">K. Walsh</span><span className="amt">€0</span><span className="st idle">Off duty</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="frow flip reveal">
              <div className="ftext">
                <div className="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M6.5 17l-1.2-4.8A2 2 0 0 1 7.2 9.7l.4-.1m0 0L9 6h6l1.4 3.6m-8.8 0h8.8m0 0 .4.1a2 2 0 0 1 1.9 2.5L17.5 17" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></svg>
                </div>
                <h3>Never miss a licence again</h3>
                <p>Every plate, odometer reading and document lives in one place — with utilisation tracking and expiry alerts that warn you weeks before a road licence, insurance or VRT lapses.</p>
                <ul className="feat-list">
                  <li><span className="tick"><Check /></span> Live utilisation per vehicle, 7-day average</li>
                  <li><span className="tick"><Check /></span> Service, idle and active status at a glance</li>
                  <li><span className="tick"><Check /></span> Tiered alerts for every expiring document</li>
                </ul>
              </div>
              <div className="shot tight">
                <ShotBar path="vehicles" />
                <div className="mock">
                  <div className="mock-cards">
                    <div className="mock-card"><div className="k">Active</div><div className="v pos">11</div></div>
                    <div className="mock-card"><div className="k">Idle</div><div className="v">2</div></div>
                    <div className="mock-card"><div className="k">Service</div><div className="v">1</div></div>
                    <div className="mock-card"><div className="k">Expiring</div><div className="v accent">3</div></div>
                  </div>
                  <div className="mock-rows">
                    <div className="mock-row"><span className="nm mono">12-D-4471</span><span className="meta">· 84% used</span><span className="st">Active</span></div>
                    <div className="mock-row"><span className="nm mono">21-C-9920</span><span className="meta">· 77% used</span><span className="st">Active</span></div>
                    <div className="mock-row"><span className="nm mono">19-L-1183</span><span className="meta">· idle 2d</span><span className="st idle">Idle</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="frow reveal">
              <div className="ftext">
                <div className="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M3 7l2 12a2 2 0 0 0 2 1.7h10A2 2 0 0 0 19 19l2-12M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M12 11v5M9.5 13.5h5" /></svg>
                </div>
                <h3>Weekly driver pay, reconciled in minutes</h3>
                <p>Rovora does the maths for every driver — gross splits, fees, cash drops, tips and adjustments — then hands you clean, payable settlements. Review, approve and run payouts in one pass.</p>
                <ul className="feat-list">
                  <li><span className="tick"><Check /></span> Automatic per-driver weekly reconciliation</li>
                  <li><span className="tick"><Check /></span> Adjustments, deductions and cash drops handled</li>
                  <li><span className="tick"><Check /></span> Month-end PDF statements, ready for the books</li>
                </ul>
              </div>
              <div className="shot tight">
                <ShotBar path="settlements" />
                <div className="mock">
                  <div className="mock-rows">
                    <div className="mock-row"><span className="nm">A. Murphy</span><span className="meta">· wk 22</span><span className="amt">€1,284</span><span className="st">Payable</span></div>
                    <div className="mock-row"><span className="nm">J. Byrne</span><span className="meta">· wk 22</span><span className="amt">€1,107</span><span className="st">Payable</span></div>
                    <div className="mock-row"><span className="nm">S. Doyle</span><span className="meta">· wk 22</span><span className="amt">€642</span><span className="st idle">Review</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mini grid */}
            <div className="mini-grid reveal-stagger">
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg></div>
                <h4>Rosters</h4>
                <p>Build weekly schedules, assign cars to drivers and catch clashes before the shift starts.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 4-6" /></svg></div>
                <h4>Financials</h4>
                <p>Income, expenses and profit across the fleet — by day, week or month, always current.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12a1 1 0 0 1 1 1v15l-3-2-2 2-2-2-2 2-2-2-2 2V5a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6" /></svg></div>
                <h4>Bookkeeping</h4>
                <p>Every transaction categorised and VAT-ready, so month-end takes minutes, not days.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.8 2.6 17a1.5 1.5 0 0 0 1.3 2.3h16.2a1.5 1.5 0 0 0 1.3-2.3L13.7 3.8a1.6 1.6 0 0 0-2.8 0Z" /><path d="M12 9v4M12 17h.01" /></svg></div>
                <h4>Damages</h4>
                <p>Log incidents against any vehicle, track repair costs and keep a full damage history.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Z" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg></div>
                <h4>Smart alerts</h4>
                <p>Expiring docs, idle cars, pending settlements — surfaced before they become a problem.</p>
              </div>
              <div className="mini">
                <div className="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg></div>
                <h4>Driver app</h4>
                <p>Drivers clock in, log shifts and see their earnings from a free app — no training needed.</p>
              </div>
            </div>
          </div>
        </section>

        {/* LIVE TRACKING — NO HARDWARE */}
        <section className="sec-pad" id="tracking">
          <div className="container">
            <div className="sec-head center reveal" style={{ marginBottom: 56 }}>
              <span className="kicker">Live tracking · No hardware</span>
              <h2 className="sec-title">A live map of your fleet — without buying a single GPS box</h2>
              <p className="sec-desc">Traditional fleet tracking means €100+ trackers wired into every car, SIM contracts and an installer. Rovora turns the phone your driver already carries into the tracker — switched on with one tap at shift start.</p>
            </div>

            <div className="frow reveal">
              <div className="ftext">
                <div className="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                </div>
                <h3>Everything a hardware tracker does. Nothing it costs.</h3>
                <p>Live positions, speeds, distance driven, route playback and a full log of who shared when — streamed from the free driver app, with privacy built in: tracking only runs during shifts, started and stopped by the driver.</p>
                <ul className="feat-list">
                  <li><span className="tick"><Check /></span> Live map with speed &amp; top speed per driver</li>
                  <li><span className="tick"><Check /></span> Draw zones — get alerted when a driver enters or leaves</li>
                  <li><span className="tick"><Check /></span> Route playback &amp; km driven for every shift</li>
                  <li><span className="tick"><Check /></span> No devices, no installation, no SIM contracts <span className="t2">— a 10-car fleet saves €1,000+ up front</span></li>
                </ul>
              </div>

              <div className="shot tight">
                <ShotBar path="fleet/tracking" />
                <div className="mapmock" aria-hidden>
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
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="sec-pad" id="how" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
          <div className="container">
            <div className="sec-head center reveal" style={{ marginBottom: 56 }}>
              <span className="kicker">How it works</span>
              <h2 className="sec-title">Up and running in three steps</h2>
              <p className="sec-desc">No migration project, no consultants. Add your fleet, run the day from one place, and stay on top of compliance, costs and pay.</p>
            </div>
            <div className="how-grid reveal-stagger">
              <div className="how-step">
                <span className="how-num mono">1</span>
                <h3>Add your fleet, drivers &amp; vehicles</h3>
                <p>Enter them in minutes or send us a spreadsheet and we&rsquo;ll import everything — drivers, vehicles and documents — for you.</p>
              </div>
              <div className="how-step">
                <span className="how-num mono">2</span>
                <h3>Run the day from one screen</h3>
                <p>Drivers clock in from the free app while shifts, mileage, services and damage all flow into Rovora — no calls, no chasing, nothing logged on paper.</p>
              </div>
              <div className="how-step">
                <span className="how-num mono">3</span>
                <h3>Stay on top of everything</h3>
                <p>Document expiries, vehicle health, weekly driver pay and the books — all reconciled and in view, so problems surface before they cost you.</p>
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS */}
        <section className="sec-pad" id="integrations" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
          <div className="container">
            <div className="sec-head center reveal" style={{ marginBottom: 56 }}>
              <span className="kicker">Integrations · On the roadmap</span>
              <h2 className="sec-title">Built to work with the tools you already run</h2>
              <p className="sec-desc">Stop copying trip data, positions and payouts by hand. We&rsquo;re building native connections across GPS &amp; telematics, ride-hail platforms, messaging and accounting — so everything flows straight into Rovora.</p>
            </div>

            <div className="integ-grid reveal-stagger">
              {INTEGRATIONS.map((it) => (
                <div className="integ" key={it.name}>
                  <span className={it.live ? 'integ-live' : 'integ-soon'}>{it.live ? 'Live' : 'Coming soon'}</span>
                  <div className="integ-logo" style={{ background: it.bg, color: it.fg, fontSize: markFontSize(it.mark) }} aria-hidden>{it.mark}</div>
                  <div className="integ-name">{it.name}</div>
                  <p className="integ-desc">{it.desc}</p>
                </div>
              ))}
            </div>

            <div className="reveal" style={{ textAlign: 'center', marginTop: 32 }}>
              <Link className="btn btn-primary btn-lg" href="/integrations">Explore all integrations</Link>
            </div>

            <p className="integ-note">
              Want a platform we haven&rsquo;t listed? <a href="mailto:hello@rovora.eu?subject=Integration%20request">Tell us</a> and we&rsquo;ll prioritise it.
            </p>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="sec-pad" id="compare">
          <div className="container">
            <div className="sec-head center reveal" style={{ marginBottom: 56 }}>
              <span className="kicker">Spreadsheets vs Rovora</span>
              <h2 className="sec-title">There&rsquo;s a calmer way to run a fleet</h2>
              <p className="sec-desc">Most small fleets run on a patchwork of spreadsheets, paper logs and group chats. Here&rsquo;s what changes the day you move to Rovora.</p>
            </div>
            <div className="cmp-grid reveal-stagger">
              <div className="cmp-card cmp-old">
                <div className="cmp-head">Spreadsheets &amp; WhatsApp</div>
                <ul className="cmp-list">
                  <li><span className="cmp-x" aria-hidden>✕</span> Vehicle docs &amp; services tracked from memory</li>
                  <li><span className="cmp-x" aria-hidden>✕</span> Damage logged on scraps of paper — costs lost</li>
                  <li><span className="cmp-x" aria-hidden>✕</span> No expiry alerts — licences lapse unnoticed</li>
                  <li><span className="cmp-x" aria-hidden>✕</span> Driver pay worked out by hand, every week</li>
                  <li><span className="cmp-x" aria-hidden>✕</span> GPS trackers: €100+ per car, SIM fees, installers</li>
                  <li><span className="cmp-x" aria-hidden>✕</span> Version chaos across a dozen spreadsheets</li>
                </ul>
              </div>
              <div className="cmp-card cmp-new">
                <div className="cmp-head">Rovora</div>
                <ul className="cmp-list">
                  <li><span className="tick"><Check /></span> Every vehicle&rsquo;s docs, mileage &amp; services in one place</li>
                  <li><span className="tick"><Check /></span> Damage logged against the car with full repair history</li>
                  <li><span className="tick"><Check /></span> Tiered alerts before any licence or doc lapses</li>
                  <li><span className="tick"><Check /></span> Driver pay reconciled automatically each week</li>
                  <li><span className="tick"><Check /></span> Live GPS map through the driver app — €0 hardware</li>
                  <li><span className="tick"><Check /></span> One source of truth, plus a free driver app</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="sec-pad" id="pricing" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
          <div className="container">
            <div className="sec-head center reveal">
              <span className="kicker">Pricing</span>
              <h2 className="sec-title">Simple, per-vehicle pricing</h2>
              <p className="sec-desc">Pay only for the cars you run. Every plan includes the full dashboard, live GPS tracking, the driver app and unlimited team members — no modules, no add-ons, no surprises.</p>
              <div className="price-incl">
                <span><span className="ck">✓</span> {TRIAL_DAYS}-day free trial</span>
                <span><span className="ck">✓</span> No card required</span>
                <span><span className="ck">✓</span> Live GPS tracking included</span>
                <span><span className="ck">✓</span> Free driver app</span>
                <span><span className="ck">✓</span> Cancel anytime</span>
              </div>
            </div>
            <PricingPlans plans={plans} />
            <p className="price-note">Prices in EUR, excl. VAT. Add vehicles any time — you&rsquo;re only billed for what you run. Cancel anytime, no lock-in.</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec-pad" id="faq">
          <div className="container">
            <div className="sec-head center reveal">
              <span className="kicker">FAQ</span>
              <h2 className="sec-title">Questions, answered</h2>
            </div>
            <div className="faq-grid reveal-stagger">
              {LANDING_FAQ.map((item, i) => (
                <details className="faq" key={item.q} open={i === 0}>
                  <summary><span className="q">{item.q}</span><span className="pm" /></summary>
                  <div className="ans">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={{ padding: '20px 0 0' }}>
          <div className="container">
            <div className="cta-band reveal">
              <h2>Ready to get your fleet on Rovora?</h2>
              <p>Start your {TRIAL_DAYS}-day free trial today. No card, no lock-in — just your whole operation, finally in one place.</p>
              <div className="hero-cta">
                <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
                <a className="btn btn-ghost btn-lg" href="/contact">Book a demo</a>
              </div>
            </div>
          </div>
        </section>

        <MarketingFooter onHome />
      </div>
      <RovoraSupportChat />
    </div>
  );
}
