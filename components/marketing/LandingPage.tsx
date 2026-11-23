import Link from 'next/link';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import type { PlanDef } from '@/lib/billing/plans';
import { trialCopy, type TrialOffer } from '@/lib/billing/trial-offer';
import { SITE_URL, ORGANIZATION_ID, organizationJsonLd, softwareApplicationJsonLd } from '@/lib/seo';
import PromoBanner from './PromoBanner';
import RovoraReveal from './RovoraReveal';
import RovoraSmoothScroll from './RovoraSmoothScroll';
import RovoraSupportChat from './RovoraSupportChat';
import MarketingNav from './MarketingNav';
import MarketingFooter from './MarketingFooter';
import IntegrationsMarquee from './IntegrationsMarquee';
import ReplacesSection from './ReplacesSection';
import { liveTestimonials } from './testimonials';
import { homeFaq, type FaqItem } from './faq';
import { SIGN_IN, START_TRIAL } from './links';
import { Icon, type IconName } from './feature/icons';
import WalkthroughButton, { type WalkthroughVideo } from './home/WalkthroughButton';
import LogoStrip from './home/LogoStrip';
import Toolkit from './home/Toolkit';
import HomePricing from './home/HomePricing';
import StoreButtons from './home/StoreButtons';
import MobileTrialBar from './home/MobileTrialBar';

// =============================================================================
// HOMEPAGE
// =============================================================================
// Hero → partner logos → "two sides" (dashboard + driver app) → the Everyday
// Toolkit → a customer story → connections → 3 setup steps → pricing → FAQ →
// final call to action. Section ids are kept from the previous layout
// (#features, #who, #how, #integrations, #pricing, #faq) so links from other
// pages and the nav still land in the right place.
// =============================================================================

const YOUTUBE_ID = 'LEqoWWGHekU';

// The walkthrough modal plays the self-hosted demo when it has been committed
// to public/videos (full HD, exactly the encode we ship) and falls back to the
// YouTube upload otherwise. Checked on the server at render/build time.
const videosDir = join(process.cwd(), 'public', 'videos');
const has = (file: string) => existsSync(join(videosDir, file));
const WALKTHROUGH: WalkthroughVideo = has('hero.mp4')
  ? {
      kind: 'file',
      mp4: '/videos/hero.mp4',
      webm: has('hero.webm') ? '/videos/hero.webm' : undefined,
      poster: has('hero.jpg') ? '/videos/hero.jpg' : undefined,
    }
  : { kind: 'youtube', id: YOUTUBE_ID };

/** The approved customer quote shown as "Fleet notes" (hidden until one exists). */
const STORY = liveTestimonials().find((t) => t.story)?.story ?? null;

const MANAGER_POINTS = [
  'Manage vehicles, drivers and their documents',
  'Plan rosters and assign shifts',
  'Work out weekly driver pay',
  'Get reminders before anything expires',
  'See income, costs and profit in one place',
];

const DRIVER_POINTS = [
  'See your shifts and assigned vehicle',
  'Track your weekly earnings and tips',
  'Get your pay statements as PDFs',
  'Know when your licence or permits need renewing',
];

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'car', title: 'Add your fleet', body: 'Add your vehicles and their documents on the website.' },
  { icon: 'users', title: 'Invite your drivers', body: 'Send each driver an invite. They download the Rovora app and sign in.' },
  { icon: 'calendar', title: 'Plan your first week', body: 'Build the roster. Drivers see their shifts in the app straight away.' },
];

/** Structured data for SEO — WebSite, Organization, FAQPage, the priced Product offers and the demo video. */
function buildJsonLd(plans: PlanDef[], faq: FaqItem[]) {
  const webSite = {
    '@type': 'WebSite',
    name: 'Rovora',
    alternateName: 'Rovora Fleet Management',
    url: SITE_URL,
  };

  const faqPage = {
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  // The walkthrough modal offers the product demo. Name and uploadDate mirror
  // the actual YouTube entry so the markup cannot contradict the source.
  const video = {
    '@type': 'VideoObject',
    name: 'Rovora Explainer',
    description:
      'A quick tour of the Rovora dashboard — vehicles, drivers, live GPS tracking, weekly driver pay and the books, all in one place.',
    thumbnailUrl: `https://i.ytimg.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${YOUTUBE_ID}`,
    contentUrl: `https://www.youtube.com/watch?v=${YOUTUBE_ID}`,
    uploadDate: '2026-07-10T02:14:15-07:00',
    publisher: { '@id': ORGANIZATION_ID },
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [webSite, organizationJsonLd(), faqPage, softwareApplicationJsonLd(plans), video],
  };
}

const Check = () => <Icon.check aria-hidden="true" />;

/** The pull-quote with its highlighted words wrapped in <mark>. */
function Pull({ text, highlight }: { text: string; highlight?: string }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{highlight}</mark>
      {text.slice(at + highlight.length)}
    </>
  );
}

export default function LandingPage({ plans, trialOffer }: { plans: PlanDef[]; trialOffer: TrialOffer }) {
  const trial = trialCopy(trialOffer);
  const faq = homeFaq(trial);
  const jsonLd = buildJsonLd(plans, faq);
  const startLabel = `Start my ${trial.lengthAdj} trial`;

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
        <PromoBanner trial={trial} />
        <MarketingNav onHome />

        {/* HERO — the pitch and both CTAs on the left, the manager dashboard
            on the right. No entrance animation: this is the first paint. */}
        <section className="home-hero" id="top">
          <div className="container home-hero-grid">
            <div className="home-hero-copy">
              <h1 className="hero-title">Run your whole fleet from <span className="pos">one screen.</span></h1>
              <p className="hero-sub">Fleet management software for taxi and rideshare fleets. You manage everything on the web. Your drivers use the Rovora app.</p>
              <div className="hero-actions">
                <Link className="btn btn-primary btn-lg" href={START_TRIAL}>{startLabel}</Link>
                <WalkthroughButton video={WALKTHROUGH} />
              </div>
              <p className="trial-note">{trial.span} free <span aria-hidden="true">·</span> No card required</p>
            </div>
            <figure className="home-hero-shot">
              <div className="app-shot">
                <div className="app-shot-bar" aria-hidden="true"><span /><span /><span /><em>Rovora dashboard · demo account</em></div>
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized 37 KB webp; it is the LCP, so it loads eagerly */}
                <img
                  src="/home/dashboard.webp"
                  width={1280}
                  height={630}
                  fetchPriority="high"
                  alt="Rovora web dashboard from the demo account: 5 active drivers, 4 active vehicles, €9,240 weekly income, €2,148 net profit, an earnings chart and documents expiring soon"
                />
              </div>
              <figcaption>The manager dashboard, from the Rovora demo account.</figcaption>
            </figure>
          </div>
        </section>

        {/* PARTNER LOGOS */}
        <LogoStrip>
          <IntegrationsMarquee />
        </LogoStrip>

        {/* ONE PLATFORM, TWO SIDES — who uses what: managers on the web,
            drivers in the app. */}
        <section className="sec-pad home-sides" id="who" aria-labelledby="sides-title">
          <div className="container">
            <div className="sec-head center reveal">
              <span className="kicker">One platform, two sides</span>
              <h2 className="sec-title" id="sides-title">A dashboard for you.<br className="br-desk" /> An app for your drivers.</h2>
              <p className="sec-desc">Owners and managers run the fleet from the Rovora website. Drivers download the Rovora app to keep track of their own work.</p>
            </div>
            <div className="sides-grid reveal-stagger">
              <article className="side-card">
                <div className="side-top">
                  <span className="side-ico" aria-hidden="true"><Icon.monitor /></span>
                  <div><span className="side-for">For owners &amp; managers</span><h3>The Rovora dashboard</h3></div>
                </div>
                <p className="side-how">On the website. Nothing to install.</p>
                <ul className="side-list">
                  {MANAGER_POINTS.map((p) => <li key={p}><Check />{p}</li>)}
                </ul>
                <div className="side-actions">
                  <Link className="btn btn-primary btn-lg" href={START_TRIAL}>{startLabel}</Link>
                  <Link className="text-link" href={SIGN_IN}>Sign in</Link>
                </div>
              </article>
              <article className="side-card side-driver">
                <div className="side-top">
                  <span className="side-ico" aria-hidden="true"><Icon.phone /></span>
                  <div><span className="side-for">For drivers</span><h3>The Rovora driver app</h3></div>
                </div>
                <p className="side-how"><strong>Download required.</strong> Your manager invites you, then you sign in on your phone.</p>
                <ul className="side-list">
                  {DRIVER_POINTS.map((p) => <li key={p}><Check />{p}</li>)}
                </ul>
                <StoreButtons />
                <p className="side-note">iPhone app coming soon. Until then, iPhone drivers use Rovora in Safari.</p>
              </article>
            </div>
          </div>
        </section>

        {/* THE EVERYDAY TOOLKIT — pick a tool, see its screen. */}
        <section className="sec-pad home-toolkit" id="features">
          <div className="container">
            <div className="tk-heading reveal">
              <h2 className="sec-title">The Everyday Toolkit.</h2>
              <p>Screens from the Rovora demo account, with sample data. Pick a tool to see it.</p>
            </div>
            <div className="reveal"><Toolkit /></div>
          </div>
        </section>

        {/* FLEET NOTES — one approved customer quote (see testimonials.ts). */}
        {STORY && (
          <section className="home-story" aria-labelledby="story-title">
            <div className="container">
              <h2 className="sr-only" id="story-title">A fleet manager’s experience with Rovora</h2>
              <figure className="story reveal">
                <div className="story-main">
                  <span className="story-eyebrow"><Icon.quote aria-hidden="true" />Fleet notes</span>
                  <blockquote>“<Pull text={STORY.pull} highlight={STORY.highlight} />”</blockquote>
                </div>
                <div className="story-fleet" aria-label="Customer fleet snapshot">
                  <span className="story-fleet-label">The fleet</span>
                  <div className="story-fleet-size"><strong>{STORY.fleetSize}</strong><span>vehicles</span></div>
                  <span className="story-place"><Icon.mapPin aria-hidden="true" />{STORY.place}</span>
                  <a className="story-next" href="#how">See how it works<Icon.arrowRight aria-hidden="true" /></a>
                </div>
                <figcaption className="story-author">
                  <span className="story-author-mark" aria-hidden="true"><Icon.user /></span>
                  <span><strong>{STORY.title}</strong><span>{STORY.fleetSize} vehicles · {STORY.place}</span></span>
                </figcaption>
              </figure>
            </div>
          </section>
        )}

        {/* YOUR FLEET, CONNECTED */}
        <ReplacesSection />

        {/* UP AND RUNNING IN 3 STEPS */}
        <section className="sec-pad home-setup" id="how">
          <div className="container">
            <h2 className="sec-title reveal">Up and running in 3 steps.</h2>
            <ol className="setup-grid reveal-stagger">
              {STEPS.map((s, i) => {
                const I = Icon[s.icon];
                return (
                  <li className="setup-card" key={s.title}>
                    <div className="setup-top">
                      <span className="step-label">Step {i + 1}</span>
                      <span className="setup-ico" aria-hidden="true"><I /></span>
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </li>
                );
              })}
            </ol>
            <p className="setup-note">Need a hand? Fleet includes guided onboarding and assisted data import.</p>
          </div>
        </section>

        {/* PRICING */}
        <section className="sec-pad home-pricing" id="pricing">
          <div className="container">
            <div className="sec-head reveal">
              <span className="kicker">Room to grow</span>
              <h2 className="sec-title">Clear pricing for<br className="br-desk" /> the fleet you run.</h2>
              <p className="sec-desc">Start with the plan that fits your working day.</p>
            </div>
            <HomePricing plans={plans} />
          </div>
        </section>

        {/* FAQ */}
        <section className="sec-pad home-faq" id="faq">
          <div className="container">
            <h2 className="sec-title reveal">A few things before you start.</h2>
            <div className="faq-list reveal-stagger">
              {faq.map((item) => (
                <details key={item.q}>
                  <summary>
                    {item.q}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="home-final">
          <div className="container">
            <h2>Make next week easier to run.</h2>
            <p>Your vehicles, your people, your working day. Together.</p>
            <div className="final-actions">
              <Link className="btn btn-primary btn-lg" href={START_TRIAL}>{startLabel}</Link>
              <Link className="btn btn-ghost btn-lg" href="/contact?topic=demo#form">Request a 15-minute demo</Link>
            </div>
            <span className="final-note">No card required</span>
          </div>
        </section>

        <MarketingFooter onHome />
      </div>
      <MobileTrialBar />
      <RovoraSupportChat trialOffer={trialOffer} />
    </div>
  );
}
