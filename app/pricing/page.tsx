import { marketingMetadata, SITE_URL } from '@/lib/seo';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { SecHead, CtaBand } from '@/components/marketing/feature/Sections';
import PricingPlans from '@/components/marketing/PricingPlans';
import { LANDING_FAQ } from '@/components/marketing/LandingPage';
import { getPublicPlans } from '@/lib/billing/plans-data';
import { TRIAL_DAYS } from '@/lib/billing/plans';

// Prices are DB-backed and admin-editable, so revalidate hourly rather than
// baking them in at build time.
export const revalidate = 3600;

export const metadata = marketingMetadata({
  title: 'Fleet Management Software Pricing & Plans — Rovora',
  description:
    "See Rovora's per-vehicle plans for taxi and rideshare fleets, what each one includes and how extra vehicles are charged. Free trial, no card needed.",
  path: '/pricing',
  keywords: [
    'fleet management software pricing',
    'fleet management software cost',
    'fleet management price per vehicle',
    'taxi fleet software pricing',
    'fleet management software free trial',
    'affordable fleet management software',
    'how much does fleet management software cost',
  ],
});

/**
 * Dedicated /pricing page.
 *
 * Pricing previously existed only as a `#pricing` anchor on the home page, so
 * the site had nothing to rank for "fleet management software pricing" — a
 * high-intent query where competitors all have a standalone URL. It also gives
 * AI assistants a single crawlable page with the real numbers on it, which is
 * what they cite when asked what a product costs.
 */
export default async function PricingPage() {
  const plans = await getPublicPlans();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Pricing', item: `${SITE_URL}/pricing` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: LANDING_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  return (
    <FeatureShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="hero" id="top">
        <div className="container reveal-stagger">
          <span className="eyebrow"><span className="live" /> Pricing</span>
          <h1 className="hero-title">
            Fleet management software pricing, <span className="pos">per vehicle</span>
          </h1>
          <p className="hero-sub">
            You pay for the vehicles you actually run — not per seat, and not for modules you
            switched off. Every plan includes the driver app, unlimited team members and the
            full {TRIAL_DAYS}-day trial.
          </p>
          <div className="hero-micro">
            <span><span className="ck">✓</span> {TRIAL_DAYS}-day free trial</span>
            <span><span className="ck">✓</span> No card required</span>
            <span><span className="ck">✓</span> Cancel any time</span>
          </div>
        </div>
      </section>

      <section className="sec-pad" id="plans" style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <div className="container">
          <SecHead
            kicker="Plans"
            title="Pick the plan that matches your fleet"
            desc="Move up or down at any time — your data, drivers and history come with you."
          />
          <PricingPlans plans={plans} />
        </div>
      </section>

      <section className="sec-pad" id="faq">
        <div className="container">
          <SecHead
            kicker="FAQ"
            title="Questions about pricing and plans"
            desc="The things fleet operators ask us before they sign up."
          />
          <div className="faq-grid reveal-stagger">
            {LANDING_FAQ.map((item, i) => (
              <details className="faq" key={item.q} open={i === 0}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Try it on your own fleet first"
        body={`Start a ${TRIAL_DAYS}-day trial with your real vehicles and drivers. No card, no sales call — if it doesn't fit, walk away.`}
      />
    </FeatureShell>
  );
}
