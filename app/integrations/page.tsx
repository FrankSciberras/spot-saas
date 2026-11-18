import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { FeatureHero, CtaBand } from '@/components/marketing/feature/Sections';
import { getTrialCopy } from '@/lib/billing/trial-offer-data';
import { marketingMetadata } from '@/lib/seo';
import BoltMark from '@/components/shared/BoltMark';
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_COUNT,
  REQUEST_INTEGRATION_MAILTO,
  markFontSize,
} from '@/lib/integrations/catalog';

export const metadata = marketingMetadata({
  title: 'Fleet Management Software Integrations — Rovora',
  description:
    'What connects to Rovora today: GPS trackers (Wialon, Traccar, flespi, Teltonika, Navixy, Samsara, Geotab, Mapon), your Bolt fleet account, Xero and QuickBooks by CSV export, and a REST API.',
  path: '/integrations',
  keywords: [
    'fleet management software integrations',
    'QuickBooks fleet integration',
    'Xero fleet integration',
    'export fleet expenses to CSV',
    'Bolt fleet integration',
    'Bolt Fleet API',
    'fleet management API',
  ],
});

/** Every live connection, for the hero "logo cloud". */
const HERO_MARKS = INTEGRATION_CATEGORIES.flatMap((c) => c.items);

// The free-trial length is admin-set (/admin → Trials), so re-render hourly
// to pick up a campaign starting or ending.
export const revalidate = 3600;

export default async function IntegrationsPage() {
  const trial = await getTrialCopy();
  return (
    <FeatureShell>
      <FeatureHero
        eyebrow={`Integrations · ${INTEGRATION_COUNT} live`}
        title="What Rovora connects to,"
        accent="today."
        sub="The GPS trackers already in your cars, your Bolt fleet account, your accountant’s software, your own tools through the API. Everything on this page works now. Nothing here is a promise."
        micro={[trial.freeLabel, 'No card required', 'Everything listed is live']}
        visual={
          <div className="integ-cloud" aria-hidden>
            {HERO_MARKS.map((it) => (
              <span
                key={it.name}
                className="integ-cloud-tile"
                style={{ background: it.bg, color: it.fg, fontSize: markFontSize(it.mark) }}
              >
                {it.logo === 'bolt' ? <BoltMark size={30} /> : it.mark}
              </span>
            ))}
          </div>
        }
      />

      <section className="sec-pad" id="marketplace">
        <div className="container">
          <div className="sec-head center reveal" style={{ marginBottom: 48 }}>
            <span className="kicker">Live today · {INTEGRATION_COUNT} connections</span>
            <h2 className="sec-title">Every connection, and what it actually does</h2>
            <p className="sec-desc">
              Each one says plainly whether it is a live connection or a file you export. What
              we&rsquo;re building next is on the <Link href="/roadmap">roadmap</Link>.
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
                    <span className="integ-live">Live</span>
                    <div
                      className="integ-logo"
                      style={{ background: it.bg, color: it.fg, fontSize: markFontSize(it.mark) }}
                      aria-hidden
                    >
                      {it.logo === 'bolt' ? <BoltMark size={28} /> : it.mark}
                    </div>
                    <div className="integ-name">{it.name}</div>
                    <p className="integ-desc">{it.desc}</p>
                    {it.more && (
                      <p className="integ-desc">
                        <Link href={it.more} style={{ color: 'var(--accent)', fontWeight: 500 }}>
                          Learn more →
                        </Link>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="integ-note">
            Need a connection that isn&rsquo;t here? <a href={REQUEST_INTEGRATION_MAILTO}>Tell us</a>{' '}
            which one, or see what&rsquo;s planned on the <Link href="/roadmap">roadmap</Link>.
          </p>
        </div>
      </section>

      <CtaBand
        title="Connect what you already run."
        body={`Get your ${trial.first} free, no card. Paste a key from your GPS platform or your Bolt fleet account and the data is in Rovora within the hour.`}
      />

      <p style={{ textAlign: 'center', margin: '8px 0 0' }}>
        <Link className="btn btn-ghost" href="/#pricing">
          See pricing
        </Link>
      </p>
    </FeatureShell>
  );
}
