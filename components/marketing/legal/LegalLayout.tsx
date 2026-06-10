import type { ReactNode } from 'react';
import FeatureShell from '../feature/FeatureShell';
import styles from './legal.module.css';

export interface LegalSection {
  /** Anchor id, also used by the table-of-contents link. */
  id: string;
  /** Heading shown in the TOC and at the top of the section. */
  heading: string;
  /** Section body — plain JSX (paragraphs, lists, etc.). */
  body: ReactNode;
}

interface LegalLayoutProps {
  eyebrow: string;
  title: string;
  lede: string;
  /** Human date, e.g. "8 June 2026". */
  lastUpdated: string;
  sections: LegalSection[];
}

/**
 * Shared scaffold for the legal pages (Privacy, Terms, Security). Renders the
 * marketing nav/footer via FeatureShell, a hero, a sticky table of contents and
 * the prose column. Each page just supplies its sections.
 */
export default function LegalLayout({ eyebrow, title, lede, lastUpdated, sections }: LegalLayoutProps) {
  return (
    <FeatureShell>
      <header className={styles.hero}>
        <div className="container">
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lede}>{lede}</p>
          <div className={styles.meta}>
            <span className={styles.metaPill}>
              <span className="dot" /> Last updated {lastUpdated}
            </span>
            <span className={styles.metaPill}>EU-hosted · GDPR-aligned</span>
            <span className={styles.metaPill}>
              Questions? <a href="mailto:privacy@rovora.eu">privacy@rovora.eu</a>
            </span>
          </div>
        </div>
      </header>

      <div className="container">
        <div className={styles.body}>
          <nav className={styles.toc} aria-label="On this page">
            <p className={styles.tocLabel}>On this page</p>
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`}>
                {s.heading}
              </a>
            ))}
          </nav>

          <article className={styles.prose}>
            {sections.map((s) => (
              <section key={s.id} id={s.id}>
                <h2>{s.heading}</h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </div>
    </FeatureShell>
  );
}

/** Shared styles re-exported so pages can reach the table / callout helpers. */
export { styles as legalStyles };
