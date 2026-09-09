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
import ReplacesSection from './ReplacesSection';
import FeaturesAccordion from './FeaturesAccordion';
import { SIGN_IN, START_TRIAL, featureHref } from './links';
import { Icon, type IconName } from './feature/icons';
import { markFontSize } from '@/lib/integrations/catalog';

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
    // Stable @id so other nodes (offers, video publisher) can reference this
    // Organization instead of repeating it or emitting a dangling reference.
    '@id': `${SITE_URL}/#organization`,
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
        priceCurrency: 'EUR',
        // A bare `price` reads as a one-off charge, which contradicts the "/ mo"
        // the page itself renders. UnitPriceSpecification states the billing
        // period explicitly so the markup and the visible price agree.
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: p.priceAmount,
          priceCurrency: 'EUR',
          billingIncrement: 1,
          unitCode: 'MON',
        },
        url: `${SITE_URL}/pricing`,
        availability: 'https://schema.org/InStock',
        seller: { '@id': `${SITE_URL}/#organization` },
      })),
  };

  // The homepage embeds a product demo (see <LiteYouTube id="LEqoWWGHekU" />).
  // Without VideoObject the video is invisible to Google Video and cannot earn a
  // video thumbnail in the SERP.
  const video = {
    '@type': 'VideoObject',
    // Name and uploadDate mirror the actual YouTube entry so the markup cannot
    // contradict the source.
    name: 'Rovora Explainer',
    description:
      'A quick tour of the Rovora dashboard — vehicles, drivers, live GPS tracking, weekly driver pay and the books, all in one place.',
    thumbnailUrl: 'https://i.ytimg.com/vi/LEqoWWGHekU/maxresdefault.jpg',
    embedUrl: 'https://www.youtube.com/embed/LEqoWWGHekU',
    contentUrl: 'https://www.youtube.com/watch?v=LEqoWWGHekU',
    uploadDate: '2026-07-10T02:14:15-07:00',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [webSite, organization, faqPage, softwareApp, video],
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
            <h1 className="hero-title">Run your whole fleet <span className="pos">from one screen</span>.</h1>
            {/* One line on purpose. The feature list that used to live here just
                pushed the video further down — and the page spends the next
                three sections listing features anyway. */}
            <p className="hero-sub">Fleet management software for taxi and rideshare fleets.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href={START_TRIAL}>Start free trial</Link>
              <a className="btn btn-ghost btn-lg" href="#how">See how it works</a>
            </div>
            {/* Two, not three: the third wrapped onto its own line at common
                widths, which made the row look accidental rather than designed. */}
            <div className="hero-micro">
              <span><span className="ck">✓</span> {TRIAL_DAYS}-day free trial</span>
              <span><span className="ck">✓</span> No card required</span>
            </div>
            {/* Trust row. Deliberately no score or review count: the Play
                listing shows no public rating yet, so the caption stays an
                opinion rather than a statistic. Swap in a real rating (with
                its source) once one exists. */}
            <div className="hero-stars" aria-label="Five stars">
              <span className="stars" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <svg key={i} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8L12 2.6z" /></svg>
                ))}
              </span>
              <span className="stars-text">Loved by fleet operators in Malta</span>
            </div>
          </div>

          {/* The demo video IS the hero visual — a real recording of the product
              beats any mockup, and putting it here means a visitor can watch it
              without scrolling or hunting for a "watch" section. It deliberately
              stands alone: nothing overlaps it, so the play button is the most
              obvious thing on the page after the CTA. */}
          <div className="container hero-stage reveal">
            <div className="hero-video">
              {/* Autoplays muted on a loop, like a living screenshot — visitors
                  unmute with the player's own controls if they want the audio. */}
              <LiteYouTube id="LEqoWWGHekU" title="Rovora — fleet management demo" priority autoplay />
            </div>
          </div>

          {/* The EU-hosted / Encrypted / GDPR strip used to sit here. Removed so
              the video gets the room instead — the claims still live on the
              /security page, which the footer links to. */}
        </section>

        {/* PLATFORMS — the ride-hail apps a fleet's money comes from. "Works
            with earnings from" is the honest framing: today Rovora imports the
            platforms' statements and does the settlement maths; a live API
            connection is on the roadmap. Wordmarks are set in type rather than
            shipped as logo files (no brand assets in the repo). */}
        <section className="platforms" aria-label="Works with earnings from Uber, Bolt and eCabs">
          <div className="container">
            <p className="platforms-cap">Works with earnings from</p>
            <div className="platforms-row">
              <span className="pmark pmark-uber">Uber</span>
              <span className="pmark pmark-bolt">Bolt</span>
              <span className="pmark pmark-ecabs">eCabs</span>
              <span className="pmark pmark-more">+ any platform via CSV</span>
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

        {/* The old "See Rovora in action" section lived here. It was removed when
            the demo moved into the hero — running the same video twice on one
            page just splits attention and buries it below three screenfuls. */}

        {/* REPLACES THE PATCHWORK — the consolidation sell, straight after the
            stats band while the "6 hrs saved on admin" number is still fresh. */}
        <ReplacesSection />

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

            {/* One accordion instead of three stacked rows + a six-card grid:
                same features, one screenful, with a live mock for whichever
                row is open. Copy + mocks live in FeaturesAccordion.tsx. */}
            <FeaturesAccordion />
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
