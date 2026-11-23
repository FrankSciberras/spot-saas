import Link from 'next/link';
import { FEATURES, AUDIENCES, featureHref, audienceHref, START_TRIAL } from '../links';
import { FEATURE_ICONS } from '../feature-icons';
import { Icon, type IconName } from '../feature/icons';
import { getPublicPlans } from '@/lib/billing/plans-data';
import { getTrialCopy } from '@/lib/billing/trial-offer-data';
import type { AudienceCard, Qa } from './types';
import styles from './deep.module.css';

/**
 * Building blocks for the long-form marketing pages. All server components;
 * they sit inside FeatureShell, so the site's theme variables cascade in.
 */

/** FAQPage structured data for a list of questions. Plain text answers only. */
export function faqJsonLd(items: Qa[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

function Head({ kicker, title, desc }: { kicker: string; title: string; desc?: string }) {
  return (
    <div className="sec-head center reveal" style={{ marginBottom: 44 }}>
      <span className="kicker">{kicker}</span>
      <h2 className="sec-title">{title}</h2>
      {desc && <p className="sec-desc">{desc}</p>}
    </div>
  );
}

/** "Who it's for" — three cards: who, their situation, what they get. */
export function Audience({ title, items }: { title: string; items: AudienceCard[] }) {
  return (
    <section className="sec-pad" id="who">
      <div className="container">
        <Head kicker="Who it’s for" title={title} />
        <div className={`${styles.audience} reveal-stagger`}>
          {items.map((a) => (
            <div key={a.who} className={styles.audCard}>
              <h3 className={styles.audWho}>{a.who}</h3>
              <p className={styles.audSituation}>{a.situation}</p>
              <p className={styles.audGets}>
                <span className={styles.audArrow} aria-hidden="true">→</span>
                {a.gets}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "What goes wrong without it" — the problems, in the operator's words. */
export function Pains({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string;
  items: { title: string; body: string }[];
}) {
  return (
    <section className={`sec-pad ${styles.band}`} id="problem">
      <div className="container">
        <Head kicker="The problem" title={title} desc={intro} />
        <div className={`${styles.pains} reveal-stagger`}>
          {items.map((p) => (
            <div key={p.title} className={styles.pain}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A normal day or week, step by step — shows how the feature is actually used. */
export function Steps({
  kicker,
  title,
  intro,
  items,
}: {
  kicker: string;
  title: string;
  intro?: string;
  items: { title: string; body: string }[];
}) {
  return (
    <section className="sec-pad" id="how">
      <div className="container">
        <Head kicker={kicker} title={title} desc={intro} />
        <ol className={`${styles.steps} reveal-stagger`}>
          {items.map((s, i) => (
            <li key={s.title} className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Honest limits. Saying what a feature does not do is what makes the rest believable. */
export function Limits({ items }: { items: { title: string; body: string }[] }) {
  return (
    <section className="sec-pad" id="limits">
      <div className="container">
        <Head
          kicker="Straight answers"
          title="What it doesn’t do"
          desc="Better you read it here than find out after you’ve moved your fleet over."
        />
        <div className={`${styles.limits} reveal-stagger`}>
          {items.map((l) => (
            <div key={l.title} className={styles.limit}>
              <h3>{l.title}</h3>
              <p>{l.body}</p>
            </div>
          ))}
        </div>
        <p className={styles.limitsFoot}>
          What we’re building next is on the <Link href="/roadmap">roadmap</Link>.
        </p>
      </div>
    </section>
  );
}

/** FAQ accordion (same markup as the homepage FAQ) plus FAQPage structured data. */
export function Faq({ title = 'Questions, answered', items }: { title?: string; items: Qa[] }) {
  return (
    <section className={`sec-pad ${styles.band}`} id="faq">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ '@context': 'https://schema.org', ...faqJsonLd(items) }).replace(/</g, '\\u003c'),
        }}
      />
      <div className="container">
        <div className="sec-head center reveal">
          <span className="kicker">FAQ</span>
          <h2 className="sec-title">{title}</h2>
        </div>
        <div className="faq-grid reveal-stagger">
          {items.map((item, i) => (
            <details className="faq" key={item.q} open={i === 0}>
              <summary>
                <span className="q">{item.q}</span>
                <span className="pm" />
              </summary>
              <div className="ans">{item.a}</div>
            </details>
          ))}
        </div>
        <p className={styles.faqFoot}>
          Something else? <Link href="/contact#form">Ask us</Link> — a person replies, usually the same day.
        </p>
      </div>
    </section>
  );
}

interface PageRef {
  href: string;
  label: string;
  blurb: string;
  icon: IconName;
  kind: string;
}

/** Every marketing page that can be cross-linked, by path. */
function pageIndex(): Record<string, PageRef> {
  const index: Record<string, PageRef> = {};
  for (const f of FEATURES) {
    index[featureHref(f.slug)] = {
      href: featureHref(f.slug),
      label: f.label,
      blurb: f.blurb,
      icon: FEATURE_ICONS[f.slug] ?? 'check',
      kind: 'Feature',
    };
  }
  for (const a of AUDIENCES) {
    index[audienceHref(a.slug)] = {
      href: audienceHref(a.slug),
      label: a.label,
      blurb: a.blurb,
      icon: 'users',
      kind: 'Who it’s for',
    };
  }
  index['/pricing'] = {
    href: '/pricing',
    label: 'Plans & pricing',
    blurb: 'Per-vehicle pricing, every price on the page, no card to start.',
    icon: 'percent',
    kind: 'Pricing',
  };
  index['/integrations'] = {
    href: '/integrations',
    label: 'Integrations',
    blurb: 'What connects to Rovora today, and what is coming.',
    icon: 'repeat',
    kind: 'Platform',
  };
  return index;
}

/** "Works with" — internal links to the pages a reader is most likely to want next. */
export function Related({ title = 'Goes well with', paths }: { title?: string; paths: string[] }) {
  const index = pageIndex();
  const items = paths.map((p) => index[p]).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <section className="sec-pad" id="related" style={{ paddingBottom: 40 }}>
      <div className="container">
        <Head kicker="Keep reading" title={title} />
        <div className={`${styles.related} reveal-stagger`}>
          {items.map((it) => {
            const I = Icon[it.icon];
            return (
              <Link key={it.href} href={it.href} className={styles.relCard}>
                <span className={styles.relKind}>{it.kind}</span>
                <span className={styles.relTitle}>
                  <span className={styles.relIcon}><I /></span>
                  {it.label}
                </span>
                <span className={styles.relBlurb}>{it.blurb}</span>
                <span className={styles.relGo}>Read more <span aria-hidden="true">→</span></span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Pricing in context: the live plan prices in one line, so nobody has to leave
 * the page to find out whether they can afford it. Prices are admin-editable,
 * so they are read from the plans table rather than typed into the copy.
 */
export async function PriceStrip() {
  const [plans, trial] = await Promise.all([getPublicPlans(), getTrialCopy()]);
  const priced = plans.filter((p) => !p.isCustom && p.priceAmount > 0);
  if (priced.length === 0) return null;
  return (
    <section className={styles.priceWrap}>
      <div className="container">
        <div className={`${styles.price} reveal`}>
          <div className={styles.priceText}>
            <span className={styles.priceKicker}>What it costs</span>
            <p>
              Every price is on the site. {trial.freeLabel}, no card, cancel any time.
            </p>
          </div>
          <ul className={styles.pricePlans}>
            {priced.map((p) => (
              <li key={p.id}>
                <span className={styles.planName}>{p.name}</span>
                <span className={styles.planPrice}>
                  €{p.priceAmount}
                  <small>/mo</small>
                </span>
                {p.includedVehicles != null && (
                  <span className={styles.planNote}>{p.includedVehicles} vehicles included</span>
                )}
              </li>
            ))}
          </ul>
          <div className={styles.priceCta}>
            <Link className="btn btn-primary" href={START_TRIAL}>Get started free</Link>
            <Link className={styles.priceLink} href="/pricing">Compare plans →</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
