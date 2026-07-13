import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { legalStyles as s } from '@/components/marketing/legal/LegalLayout';
import { marketingMetadata } from '@/lib/seo';
import { START_TRIAL } from '@/components/marketing/links';
import { RELEASES, RELEASE_COUNT, LATEST_UPDATED, type ChangeTag } from '@/components/marketing/changelog/releases';
import styles from '@/components/marketing/changelog/changelog.module.css';

export const metadata = marketingMetadata({
  title: 'What’s New — Rovora Changelog',
  description:
    'Every update to Rovora fleet management software, in plain English. New features, improvements and fixes for live tracking, driver settlements, maintenance and more — shipped since December 2025.',
  path: '/changelog',
  keywords: [
    'Rovora changelog',
    'Rovora updates',
    'fleet management software updates',
    'fleet software new features',
    'product changelog',
    "what's new Rovora",
  ],
});

const TAG_LABEL: Record<ChangeTag, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
  security: 'Security',
};

/** Legend order + the module class that colours each chip. */
const LEGEND: { tag: ChangeTag; cls: string }[] = [
  { tag: 'new', cls: styles.new },
  { tag: 'improved', cls: styles.improved },
  { tag: 'fixed', cls: styles.fixed },
  { tag: 'security', cls: styles.security },
];

export default function ChangelogPage() {
  return (
    <FeatureShell>
      <header className={s.hero}>
        <div className="container">
          <span className={s.eyebrow}>Changelog</span>
          <h1 className={s.title}>What&rsquo;s new in Rovora.</h1>
          <p className={s.lede}>
            We ship improvements constantly — new features, refinements and fixes for the fleet
            operators who run their whole business on Rovora. Here&rsquo;s everything we&rsquo;ve
            built, newest first.
          </p>
          <div className={styles.heroMeta}>
            <span className={styles.metaPill}>
              <span className={styles.pillDot} /> {RELEASE_COUNT} releases
            </span>
            <span className={styles.metaPill}>Last updated {LATEST_UPDATED}</span>
            <span className={styles.metaPill}>Shipping since December 2025</span>
          </div>
        </div>
      </header>

      <div className="container">
        {/* Legend for the coloured change chips. */}
        <div className={styles.legend}>
          {LEGEND.map(({ tag, cls }) => (
            <span key={tag} className={styles.legendItem}>
              <span className={`${styles.tag} ${cls}`}>{TAG_LABEL[tag]}</span>
            </span>
          ))}
        </div>

        <div className={styles.timeline}>
          {RELEASES.map((rel) => (
            <article
              key={rel.id}
              id={rel.id}
              className={`${styles.release} ${rel.highlight ? styles.featured : ''}`}
            >
              <div className={styles.rail}>
                <time className={styles.date} dateTime={rel.date}>
                  {rel.dateHuman}
                </time>
                {rel.highlight && <span className={styles.latestTag}>Latest</span>}
              </div>

              <span className={styles.dot} aria-hidden="true" />

              <div className={styles.card}>
                <h2 className={styles.title}>{rel.title}</h2>
                <p className={styles.summary}>{rel.summary}</p>
                <ul className={styles.items}>
                  {rel.items.map((item, i) => (
                    <li key={i} className={styles.item}>
                      <span className={`${styles.tag} ${styles[item.tag]}`}>
                        {TAG_LABEL[item.tag]}
                      </span>
                      <span className={styles.body}>
                        <span className={styles.area}>{item.area}</span>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>

      <section style={{ padding: '40px 0 0' }}>
        <div className="container">
          <div className="cta-band reveal">
            <h2>More on the way.</h2>
            <p>
              Driver trip history, safety scores and Rovora AI are in active development. Start a
              free trial today and every update lands in your fleet automatically — nothing to
              install, nothing to pay extra for.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href={START_TRIAL}>
                Start free trial
              </Link>
              <Link className="btn btn-ghost btn-lg" href="/ai">
                See what&rsquo;s coming
              </Link>
            </div>
          </div>
        </div>
      </section>
    </FeatureShell>
  );
}
