import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { FeatureHero, CtaBand } from '@/components/marketing/feature/Sections';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { marketingMetadata } from '@/lib/seo';
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_COUNT,
  REQUEST_INTEGRATION_MAILTO,
  markFontSize,
} from '@/lib/integrations/catalog';

export const metadata = marketingMetadata({
  title: 'Fleet Management Software Integrations — Rovora',
  description:
    'Connect Rovora to the tools you already run. Export fleet expenses to QuickBooks or Xero by CSV today, with GPS, ride-hail and messaging links coming.',
  path: '/integrations',
  keywords: [
    'fleet management software integrations',
    'QuickBooks fleet integration',
    'Xero fleet integration',
    'export fleet expenses to CSV',
    'GPS telematics integration',
    'Uber Bolt fleet integration',
    'fleet software integrations marketplace',
  ],
});

/** A few standout tiles for the hero "logo cloud". */
const HERO_MARKS = INTEGRATION_CATEGORIES.flatMap((c) => c.items).filter((it) =>
  ['Wialon', 'Traccar', 'Uber', 'Stripe', 'WhatsApp', 'Xero', 'QuickBooks', 'flespi'].includes(
    it.name,
  ),
);

export default function IntegrationsPage() {
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow="Integrations · Marketplace"
        title="Fleet integrations for the tools"
        accent="you already run."
        sub="A growing marketplace of native connections — GPS trackers, ride-hail platforms, messaging and your accountant's software. Stop copying trips and payouts by hand and let the data flow straight into Rovora."
        micro={[`${TRIAL_DAYS}-day free trial`, 'No card required', 'More integrations shipping every month']}
        visual={
          <div className="integ-cloud" aria-hidden>
            {HERO_MARKS.map((it) => (
              <span
                key={it.name}
                className="integ-cloud-tile"
                style={{ background: it.bg, color: it.fg, fontSize: markFontSize(it.mark) }}
              >
                {it.mark}
              </span>
            ))}
          </div>
        }
      />

      <section className="sec-pad" id="marketplace">
        <div className="container">
          <div className="sec-head center reveal" style={{ marginBottom: 48 }}>
            <span className="kicker">On the roadmap · {INTEGRATION_COUNT} connections</span>
            <h2 className="sec-title">Everything your fleet talks to, in one place</h2>
            <p className="sec-desc">
              We&rsquo;re building each of these as a first-class connection inside Rovora. The ones
              marked <em>Live</em> work today; the rest are landing soon — tell us which you need
              first and we&rsquo;ll prioritise it.
            </p>
          </div>

          {INTEGRATION_CATEGORIES.map((cat) => (
            <div className="integ-cat reveal" key={cat.key}>
              <div className="integ-cat-head">
                <h3 className="integ-cat-title">{cat.title}</h3>
                <p className="integ-cat-blurb">{cat.blurb}</p>
              </div>
              <div className="integ-grid">
                {cat.items.map((it) => (
                  <div className="integ" key={it.name}>
                    <span className={it.status === 'live' ? 'integ-live' : 'integ-soon'}>
                      {it.status === 'live' ? 'Live' : 'Coming soon'}
                    </span>
                    <div
                      className="integ-logo"
                      style={{ background: it.bg, color: it.fg, fontSize: markFontSize(it.mark) }}
                      aria-hidden
                    >
                      {it.mark}
                    </div>
                    <div className="integ-name">{it.name}</div>
                    <p className="integ-desc">{it.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="integ-note">
            Want a platform we haven&rsquo;t listed?{' '}
            <a href={REQUEST_INTEGRATION_MAILTO}>Tell us</a> and we&rsquo;ll prioritise it.
          </p>
        </div>
      </section>

      <CtaBand
        title="Run your fleet on the tools you already love."
        body={`Start your ${TRIAL_DAYS}-day free trial today and be first in line as each integration goes live.`}
      />

      <p style={{ textAlign: 'center', margin: '8px 0 0' }}>
        <Link className="btn btn-ghost" href="/#pricing">
          See pricing
        </Link>
      </p>
    </FeatureShell>
  );
}
