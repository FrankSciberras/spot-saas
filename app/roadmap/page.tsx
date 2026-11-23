import Link from 'next/link';
import FeatureShell from '@/components/marketing/feature/FeatureShell';
import { legalStyles as s } from '@/components/marketing/legal/LegalLayout';
import { marketingMetadata } from '@/lib/seo';
import { START_TRIAL } from '@/components/marketing/links';
import { RELEASES, RELEASE_COUNT } from '@/components/marketing/changelog/releases';
import {
  ROADMAP,
  ROADMAP_UPDATED,
  type RoadmapStatus,
} from '@/components/marketing/roadmap/roadmap';
import styles from '@/components/marketing/roadmap/roadmap.module.css';

export const metadata = marketingMetadata({
  title: 'Roadmap: What’s Shipped & What’s Next — Rovora',
  description:
    'Rovora’s product roadmap: every release so far, what we are building right now, and what comes next for fleet operators — integrations, Rovora AI and more.',
  path: '/roadmap',
  keywords: [
    'Rovora roadmap',
    'Rovora product roadmap',
    'fleet management software roadmap',
    'Rovora upcoming features',
    'Rovora AI',
  ],
});

const COLUMNS: { status: RoadmapStatus; label: string; blurb: string; cls: string }[] = [
  {
    status: 'in-progress',
    label: 'Building now',
    blurb: 'In development, in review or in private beta.',
    cls: styles.now,
  },
  {
    status: 'next',
    label: 'Up next',
    blurb: 'Committed — work starts as soon as the current batch ships.',
    cls: styles.next,
  },
  {
    status: 'later',
    label: 'Later',
    blurb: 'On the list. Tell us which one you need and it moves up.',
    cls: styles.later,
  },
];

function humanDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Malta',
  });
}

/** Releases grouped by year, newest first (RELEASES is already newest first). */
function releasesByYear() {
  const years = new Map<string, typeof RELEASES>();
  for (const rel of RELEASES) {
    const y = rel.date.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), rel]);
  }
  return [...years.entries()];
}

export default function RoadmapPage() {
  const inProgress = ROADMAP.filter((i) => i.status === 'in-progress').length;
  const shippedChanges = RELEASES.reduce((n, r) => n + r.items.length, 0);

  return (
    <FeatureShell breadcrumb={[{ name: 'Roadmap', path: '/roadmap' }]}>
      <header className={s.hero}>
        <div className="container">
          <span className={s.eyebrow}>Roadmap</span>
          <h1 className={s.title}>Rovora roadmap: what we&rsquo;ve shipped and what&rsquo;s next</h1>
          <p className={s.lede}>
            Everything we&rsquo;ve built for fleet operators since launch, what we&rsquo;re building
            right now, and what comes after. We don&rsquo;t promise dates &mdash; the order is set by
            what fleets on Rovora ask for most.
          </p>
          <div className={styles.heroMeta}>
            <span className={styles.metaPill}>
              <span className={styles.pillDot} /> {RELEASE_COUNT} releases shipped
            </span>
            <span className={styles.metaPill}>{shippedChanges} changes</span>
            <span className={styles.metaPill}>{inProgress} in progress</span>
            <span className={styles.metaPill}>Reviewed {humanDate(ROADMAP_UPDATED)}</span>
          </div>
        </div>
      </header>

      <div className="container">
        {/* ── Building now / Up next / Later ── */}
        <section className={styles.section} aria-labelledby="coming">
          <h2 id="coming" className={styles.sectionTitle}>
            Coming up
          </h2>
          <div className={styles.board}>
            {COLUMNS.map((col) => {
              const items = ROADMAP.filter((i) => i.status === col.status);
              return (
                <div key={col.status} className={`${styles.column} ${col.cls}`}>
                  <div className={styles.colHead}>
                    <span className={styles.colDot} aria-hidden="true" />
                    <h3 className={styles.colTitle}>{col.label}</h3>
                    <span className={styles.colCount}>{items.length}</span>
                  </div>
                  <p className={styles.colBlurb}>{col.blurb}</p>
                  <ul className={styles.cards}>
                    {items.map((item) => (
                      <li key={item.id} id={item.id} className={styles.card}>
                        <div className={styles.cardTop}>
                          <span className={styles.area}>{item.area}</span>
                          {item.note && <span className={styles.note}>{item.note}</span>}
                        </div>
                        <h4 className={styles.cardTitle}>{item.title}</h4>
                        <p className={styles.cardText}>{item.text}</p>
                        {item.href && (
                          <Link className={styles.more} href={item.href}>
                            Learn more <span aria-hidden="true">&rarr;</span>
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Shipped — built straight from the changelog ── */}
        <section className={styles.section} aria-labelledby="shipped">
          <div className={styles.shippedHead}>
            <h2 id="shipped" className={styles.sectionTitle}>
              Shipped so far
            </h2>
            <Link className={styles.more} href="/changelog">
              Full changelog <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>

          {releasesByYear().map(([year, releases]) => (
            <div key={year} className={styles.year}>
              <div className={styles.yearLabel}>{year}</div>
              <ol className={styles.shippedList}>
                {releases.map((rel) => {
                  const areas = [...new Set(rel.items.map((i) => i.area))];
                  return (
                    <li key={rel.id} className={styles.shipped}>
                      <time className={styles.shippedDate} dateTime={rel.date}>
                        {rel.dateHuman}
                      </time>
                      <div className={styles.shippedBody}>
                        <Link className={styles.shippedTitle} href={`/changelog#${rel.id}`}>
                          {rel.title}
                        </Link>
                        <div className={styles.areas}>
                          {areas.map((a) => (
                            <span key={a} className={styles.areaChip}>
                              {a}
                            </span>
                          ))}
                          <span className={styles.changeCount}>
                            {rel.items.length} {rel.items.length === 1 ? 'change' : 'changes'}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      </div>

      <section style={{ padding: '40px 0 0' }}>
        <div className="container">
          <div className="cta-band reveal">
            <h2>Need something that isn&rsquo;t here?</h2>
            <p>
              Most of this list started as a request from a fleet. Tell us what would save you the
              most time and we&rsquo;ll tell you honestly where it sits. Every update lands in your
              fleet automatically &mdash; nothing to install, nothing extra to pay.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-primary btn-lg" href={START_TRIAL}>
                Get started free
              </Link>
              <Link className="btn btn-ghost btn-lg" href="/contact#form">
                Request a feature
              </Link>
            </div>
          </div>
        </div>
      </section>
    </FeatureShell>
  );
}
